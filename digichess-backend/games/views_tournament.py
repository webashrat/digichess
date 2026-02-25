from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tournament, TournamentParticipant
from .serializers_tournament import (
    TournamentRegisterSerializer,
    TournamentSerializer,
    TournamentWinnersSerializer,
)
from games.tasks import swiss_pairings
from .tournament_lifecycle import (
    advance_tournament,
    build_tournament_standings,
    create_knockout_round,
    create_round_robin_round,
    find_user_open_game,
    finish_tournament,
    pair_idle_arena_players,
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
        qs = Tournament.objects.annotate(participants_count=models.Count("participants"))
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
        tournament = get_object_or_404(Tournament.objects.annotate(participants_count=models.Count("participants")), id=pk)
        return Response(TournamentSerializer(tournament).data)


class TournamentRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        now = timezone.now()
        late_allowed = (
            tournament.status == Tournament.STATUS_ACTIVE
            and tournament.type in {Tournament.TYPE_ARENA, Tournament.TYPE_SWISS}
        )
        if not late_allowed and (tournament.status != Tournament.STATUS_PENDING or now >= tournament.start_at):
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
        deleted, _ = TournamentParticipant.objects.filter(
            tournament=tournament, user=request.user
        ).delete()
        if deleted:
            return Response({"detail": "Unregistered"}, status=status.HTTP_200_OK)
        return Response({"detail": "Not registered"}, status=status.HTTP_200_OK)


class TournamentStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise PermissionDenied("Only the creator can start the tournament.")
        try:
            tournament = start_tournament(tournament)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TournamentSerializer(tournament).data)


class TournamentFinishView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise PermissionDenied("Only the creator can finish the tournament.")
        data = TournamentWinnersSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tournament = finish_tournament(
            tournament, winners=data.validated_data["winners"][:3], finished_at=timezone.now()
        )
        return Response(TournamentSerializer(tournament).data)


class TournamentStandingsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        return Response({"standings": build_tournament_standings(tournament)})


class TournamentMyGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        is_registered = TournamentParticipant.objects.filter(
            tournament=tournament, user=request.user
        ).exists()
        if not is_registered:
            return Response({"is_registered": False, "game_id": None})
        game_id = find_user_open_game(tournament, request.user.id)
        return Response({"is_registered": True, "game_id": game_id})


class TournamentPairingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise PermissionDenied("Only the creator can generate pairings.")
        if tournament.status != Tournament.STATUS_ACTIVE:
            return Response(
                {"detail": "Tournament is not active."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if tournament.type == Tournament.TYPE_SWISS:
            swiss_pairings.delay(tournament.id)
            return Response({"detail": "Swiss pairings started"}, status=status.HTTP_202_ACCEPTED)
        if tournament.type == Tournament.TYPE_ARENA:
            created = pair_idle_arena_players(tournament)
            return Response({"pairings": created}, status=status.HTTP_201_CREATED)
        if tournament.type == Tournament.TYPE_ROUND_ROBIN:
            created = create_round_robin_round(
                tournament, round_number=tournament.current_round or 1
            )
            return Response({"pairings": created}, status=status.HTTP_201_CREATED)
        if tournament.type == Tournament.TYPE_KNOCKOUT:
            created = create_knockout_round(
                tournament, round_number=tournament.current_round or 1
            )
            if not created:
                outcome = advance_tournament(tournament)
                created = outcome.get("pairings", [])
            return Response({"pairings": created}, status=status.HTTP_201_CREATED)
        return Response({"pairings": []}, status=status.HTTP_200_OK)
