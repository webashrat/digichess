from datetime import datetime
import math

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
import chess
from games.tasks import swiss_pairings


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
        if tournament.status != Tournament.STATUS_PENDING or now >= tournament.start_at:
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


class TournamentStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can start the tournament.")
        if tournament.status != Tournament.STATUS_PENDING:
            return Response({"detail": "Tournament already started."}, status=status.HTTP_400_BAD_REQUEST)

        participants = list(tournament.participants.order_by("joined_at"))
        count = len(participants)
        if tournament.type == Tournament.TYPE_KNOCKOUT:
            if count < 2:
                return Response({"detail": "Not enough participants for knockout."}, status=status.HTTP_400_BAD_REQUEST)
            # enforce 2^x participants: drop late joiners
            power = 2 ** int(math.floor(math.log(count, 2)))
            to_drop = count - power
            if to_drop > 0:
                drop_ids = [p.id for p in participants[-to_drop:]]
                TournamentParticipant.objects.filter(id__in=drop_ids).delete()
        elif tournament.type == Tournament.TYPE_ARENA:
            if count < 2:
                return Response({"detail": "Not enough participants for arena."}, status=status.HTTP_400_BAD_REQUEST)
        elif tournament.type == Tournament.TYPE_SWISS:
            if count < 2:
                return Response({"detail": "Not enough participants for swiss."}, status=status.HTTP_400_BAD_REQUEST)
            tournament.current_round = 1

        tournament.status = Tournament.STATUS_ACTIVE
        tournament.started_at = timezone.now()
        if tournament.type == Tournament.TYPE_ARENA and tournament.arena_duration_minutes > 0:
            tournament.finished_at = tournament.started_at + timezone.timedelta(minutes=tournament.arena_duration_minutes)
        tournament.save(update_fields=["status", "started_at"])
        return Response(TournamentSerializer(tournament).data)


class TournamentFinishView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can finish the tournament.")
        data = TournamentWinnersSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tournament.winners = data.validated_data["winners"][:3]
        tournament.status = Tournament.STATUS_COMPLETED
        tournament.finished_at = timezone.now()
        tournament.save(update_fields=["winners", "status", "finished_at"])
        return Response(TournamentSerializer(tournament).data)


class TournamentStandingsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        participants = list(tournament.participants.select_related("user"))
        scores = {p.user_id: 0 for p in participants}
        opponents = {p.user_id: [] for p in participants}
        games = tournament.tournament_games.select_related("game")
        for tg in games:
            g = tg.game
            if tournament.type == Tournament.TYPE_ARENA:
                if g.result == Game.RESULT_WHITE:
                    scores[g.white_id] = scores.get(g.white_id, 0) + 3
                elif g.result == Game.RESULT_BLACK:
                    scores[g.black_id] = scores.get(g.black_id, 0) + 3
                elif g.result == Game.RESULT_DRAW:
                    scores[g.white_id] = scores.get(g.white_id, 0) + 1
                    scores[g.black_id] = scores.get(g.black_id, 0) + 1
            else:
                if g.result == Game.RESULT_WHITE:
                    scores[g.white_id] = scores.get(g.white_id, 0) + 1
                    opponents.setdefault(g.white_id, []).append(g.black_id)
                    opponents.setdefault(g.black_id, []).append(g.white_id)
                elif g.result == Game.RESULT_BLACK:
                    scores[g.black_id] = scores.get(g.black_id, 0) + 1
                    opponents.setdefault(g.white_id, []).append(g.black_id)
                    opponents.setdefault(g.black_id, []).append(g.white_id)
                elif g.result == Game.RESULT_DRAW:
                    scores[g.white_id] = scores.get(g.white_id, 0) + 0.5
                    scores[g.black_id] = scores.get(g.black_id, 0) + 0.5
                    opponents.setdefault(g.white_id, []).append(g.black_id)
                    opponents.setdefault(g.black_id, []).append(g.white_id)
        if tournament.type == Tournament.TYPE_ARENA:
            sort_ids = sorted(scores.keys(), key=lambda x: (-scores.get(x, 0), x))
            result = []
            for uid in sort_ids:
                try:
                    u = tournament.participants.get(user_id=uid).user
                    result.append({"user_id": uid, "username": u.username, "score": scores.get(uid, 0)})
                except TournamentParticipant.DoesNotExist:
                    continue
            return Response({"standings": result})
        # Swiss tiebreaks: Buchholz and Median Buchholz
        buchholz = {}
        median_buchholz = {}
        for uid, opps in opponents.items():
            opp_score = sum(scores.get(oid, 0) for oid in opps)
            buchholz[uid] = opp_score
            if len(opps) < 3:
                median_buchholz[uid] = opp_score
            else:
                opp_scores = sorted([scores.get(oid, 0) for oid in opps])
                trimmed = opp_scores[1:-1]
                median_buchholz[uid] = sum(trimmed)
        sort_ids = sorted(
            scores.keys(),
            key=lambda x: (
                -scores.get(x, 0),
                -buchholz.get(x, 0),
                -median_buchholz.get(x, 0),
                x,
            ),
        )
        result = []
        for uid in sort_ids:
            try:
                u = tournament.participants.get(user_id=uid).user
                result.append(
                    {
                        "user_id": uid,
                        "username": u.username,
                        "score": scores.get(uid, 0),
                        "buchholz": buchholz.get(uid, 0),
                        "median_buchholz": median_buchholz.get(uid, 0),
                    }
                )
            except TournamentParticipant.DoesNotExist:
                continue
        return Response({"standings": result})


class TournamentPairingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        tournament = get_object_or_404(Tournament, id=pk)
        if request.user != tournament.creator:
            raise permissions.PermissionDenied("Only the creator can generate pairings.")
        if tournament.type == Tournament.TYPE_SWISS:
            swiss_pairings.delay(tournament.id)
            return Response({"detail": "Swiss pairings started"}, status=status.HTTP_202_ACCEPTED)
        participants = list(tournament.participants.select_related("user"))
        available = [p.user for p in participants if not Game.objects.filter(
            status=Game.STATUS_ACTIVE, white=p.user
        ).exists() and not Game.objects.filter(status=Game.STATUS_ACTIVE, black=p.user).exists()]
        pairings = []
        # Simple random pairing
        while len(available) >= 2:
            a = available.pop(0)
            b = available.pop(0)
            pairings.append((a, b))
        created = []
        for white, black in pairings:
            g = Game.objects.create(
                creator=request.user,
                white=white,
                black=black,
                time_control=tournament.time_control,
                initial_time_seconds=tournament.initial_time_seconds,
                increment_seconds=tournament.increment_seconds,
                white_time_seconds=tournament.initial_time_seconds,
                black_time_seconds=tournament.initial_time_seconds,
                white_increment_seconds=tournament.increment_seconds,
                black_increment_seconds=tournament.increment_seconds,
                white_time_left=tournament.initial_time_seconds,
                black_time_left=tournament.initial_time_seconds,
                current_fen=chess.STARTING_FEN,
            )
            TournamentGame.objects.create(tournament=tournament, game=g, round_number=tournament.current_round or 0)
            created.append(g.id)
        return Response({"pairings": created}, status=status.HTTP_201_CREATED)
