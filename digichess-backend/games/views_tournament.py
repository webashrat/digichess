from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Game, Tournament, TournamentParticipant, TournamentGame
from .serializers_tournament import (
    TournamentRegisterSerializer,
    TournamentSerializer,
    TournamentWinnersSerializer,
)
from games.tasks import swiss_pairings
from .tournament_service import (
    compute_standings,
    create_knockout_round,
    create_round_robin_round,
    finish_tournament,
    get_knockout_winners,
    start_tournament,
)


def paginate_queryset(queryset, request, serializer_class):
    try:
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
    except ValueError:
        page, page_size = 1, 20
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    start = (page - 1) * page_size
    end = start + page_size
    total = queryset.count()
    data = serializer_class(queryset[start:end], many=True, context={"request": request}).data
    return {
        "results": data,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


class TournamentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Tournament.objects.annotate(
            participants_count=models.Count(
                "participants",
                filter=models.Q(participants__withdrawn_at__isnull=True),
            )
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        type_filter = request.query_params.get("type")
        if type_filter:
            qs = qs.filter(type=type_filter)
        return Response(paginate_queryset(qs, request, TournamentSerializer))

    def post(self, request):
        serializer = TournamentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tournament = serializer.save()
        return Response(TournamentSerializer(tournament).data, status=status.HTTP_201_CREATED)


class TournamentDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        tournament = get_object_or_404(
            Tournament.objects.annotate(
                participants_count=models.Count(
                    "participants",
                    filter=models.Q(participants__withdrawn_at__isnull=True),
                )
            ),
            id=pk,
        )
        return Response(TournamentSerializer(tournament).data)

    def delete(self, request, pk: int):
        if not request.user.is_authenticated:
            raise permissions.PermissionDenied("Authentication required.")
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can delete the tournament.")
        if tournament.status != Tournament.STATUS_PENDING:
            return Response({"detail": "Only pending tournaments can be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        tournament.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk: int):
        if not request.user.is_authenticated:
            raise permissions.PermissionDenied("Authentication required.")
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can edit the tournament.")
        if tournament.status != Tournament.STATUS_PENDING:
            return Response({"detail": "Tournament already live."}, status=status.HTTP_400_BAD_REQUEST)
        if tournament.start_at <= timezone.now():
            return Response({"detail": "Tournament already started."}, status=status.HTTP_400_BAD_REQUEST)
        allowed_fields = {
            "name",
            "description",
            "type",
            "time_control",
            "initial_time_seconds",
            "increment_seconds",
            "start_at",
            "arena_duration_minutes",
            "swiss_rounds",
            "rated",
            "password",
        }
        payload = {k: v for k, v in request.data.items() if k in allowed_fields}
        if not payload:
            return Response({"detail": "No editable fields provided."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = TournamentSerializer(tournament, data=payload, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tournament = serializer.save()
        return Response(TournamentSerializer(tournament).data)


class TournamentRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        now = timezone.now()
        allow_late = tournament.type in {Tournament.TYPE_ARENA, Tournament.TYPE_SWISS}
        if tournament.status == Tournament.STATUS_COMPLETED:
            return Response({"detail": "Registration closed."}, status=status.HTTP_400_BAD_REQUEST)
        if allow_late:
            if tournament.status not in {Tournament.STATUS_PENDING, Tournament.STATUS_ACTIVE}:
                return Response({"detail": "Registration closed."}, status=status.HTTP_400_BAD_REQUEST)
        elif tournament.status != Tournament.STATUS_PENDING or now >= tournament.start_at:
            return Response({"detail": "Registration closed."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get password from request if provided
        password = request.data.get("password", "")
        serializer = TournamentRegisterSerializer(
            data={"tournament_id": pk, "password": password}, 
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Registered"}, status=status.HTTP_200_OK)


class TournamentUnregisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if tournament.status == Tournament.STATUS_COMPLETED:
            return Response({"detail": "Tournament already completed."}, status=status.HTTP_400_BAD_REQUEST)
        if tournament.status == Tournament.STATUS_ACTIVE and tournament.type == Tournament.TYPE_KNOCKOUT:
            return Response({"detail": "Cannot unregister from knockout after start."}, status=status.HTTP_400_BAD_REQUEST)
        participant = TournamentParticipant.objects.filter(tournament=tournament, user=request.user).first()
        if not participant:
            return Response({"detail": "You are not registered."}, status=status.HTTP_400_BAD_REQUEST)
        participant.withdrawn_at = timezone.now()
        participant.save(update_fields=["withdrawn_at"])
        return Response({"detail": "Unregistered"}, status=status.HTTP_200_OK)


class TournamentMyGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        is_registered = TournamentParticipant.objects.filter(
            tournament=tournament,
            user=request.user,
            withdrawn_at__isnull=True,
        ).exists()
        has_played = TournamentGame.objects.filter(
            tournament=tournament,
            game__white=request.user,
        ).exists() or TournamentGame.objects.filter(
            tournament=tournament,
            game__black=request.user,
        ).exists()
        game = (
            TournamentGame.objects.filter(
                tournament=tournament,
                game__status__in=[Game.STATUS_ACTIVE, Game.STATUS_PENDING],
            )
            .filter(models.Q(game__white=request.user) | models.Q(game__black=request.user))
            .select_related("game")
            .order_by("-game__created_at")
            .first()
        )
        return Response(
            {
                "game_id": game.game_id if game else None,
                "is_registered": is_registered,
                "has_played": has_played,
            }
        )


class TournamentStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can start the tournament.")
        if tournament.status != Tournament.STATUS_PENDING:
            return Response({"detail": "Tournament already started."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start_tournament(tournament)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TournamentSerializer(tournament).data)


class TournamentFinishView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can finish the tournament.")
        data = TournamentWinnersSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        finish_tournament(tournament, winners=data.validated_data["winners"][:3])
        return Response(TournamentSerializer(tournament).data)


class TournamentStandingsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        standings = compute_standings(tournament)
        return Response({"standings": standings})


class TournamentPairingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can generate pairings.")
        if tournament.type == Tournament.TYPE_SWISS:
            swiss_pairings.delay(tournament.id)
            return Response({"detail": "Swiss pairings started"}, status=status.HTTP_202_ACCEPTED)
        created = []
        if tournament.type == Tournament.TYPE_ROUND_ROBIN:
            created = create_round_robin_round(tournament, tournament.current_round or 1)
        elif tournament.type == Tournament.TYPE_KNOCKOUT:
            round_number = tournament.current_round or 1
            winners = None
            if round_number > 1:
                winners = get_knockout_winners(tournament, round_number - 1)
            created = create_knockout_round(tournament, round_number, winners=winners)
        return Response({"created": len(created)}, status=status.HTTP_201_CREATED)
