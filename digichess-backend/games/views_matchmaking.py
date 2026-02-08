import time
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from .models import Game
from .serializers import GameSerializer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from utils.redis_client import get_redis


class EnqueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        time_control = request.data.get("time_control")
        if time_control not in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]:
            return Response({"detail": "Only rated pools allowed for matchmaking."}, status=status.HTTP_400_BAD_REQUEST)

        if Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(white=request.user).exists() or Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(black=request.user).exists():
            return Response({"detail": "You are already in an active game."}, status=status.HTTP_400_BAD_REQUEST)

        r = get_redis()
        zkey = f"mm:{time_control}:z"
        tkey = f"mm:{time_control}:ts"
        # Determine player's rating for this pool
        rating_map = {
            Game.TIME_BULLET: "rating_bullet",
            Game.TIME_BLITZ: "rating_blitz",
            Game.TIME_RAPID: "rating_rapid",
            Game.TIME_CLASSICAL: "rating_classical",
        }
        rating_field = rating_map.get(time_control, "rating_blitz")
        my_rating = getattr(request.user, rating_field, 800)

        opponent_id = None
        try:
            # Remove stale self entry
            r.zrem(zkey, request.user.id)
            # Search with expanding windows
            windows = [100, 200, 400, 800, 1600]
            for w in windows:
                low = my_rating - w
                high = my_rating + w
                candidates = r.zrangebyscore(zkey, low, high, 0, 5)
                for cand in candidates:
                    cand_id = int(cand)
                    if cand_id == request.user.id:
                        continue
                    # Found opponent, remove both
                    r.zrem(zkey, cand_id)
                    r.hdel(tkey, cand_id)
                    opponent_id = cand_id
                    break
                if opponent_id:
                    break
        except Exception:
            opponent_id = None

        if opponent_id:
            try:
                opponent = User.objects.get(id=opponent_id)
            except User.DoesNotExist:
                opponent = None
            if opponent:
                payload = {
                    "opponent_id": opponent.id,
                    "time_control": time_control,
                }
                serializer = GameSerializer(data=payload, context={"request": request, "matchmaking": True})
                serializer.is_valid(raise_exception=True)
                game = serializer.save()
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f"user_{opponent.id}",
                    {"type": "game.event", "payload": {"type": "match_found", "game_id": game.id}},
                )
                async_to_sync(channel_layer.group_send)(
                    "mm_global",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "match_found",
                            "game_id": game.id,
                            "time_control": time_control,
                        },
                    },
                )
                return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)

        # Otherwise, enqueue this user into sorted set with timestamp
        try:
            r.zadd(zkey, {request.user.id: my_rating})
            r.hset(tkey, request.user.id, int(time.time()))
        except Exception:
            pass

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{request.user.id}",
            {"type": "game.event", "payload": {"type": "enqueued", "time_control": time_control}},
        )
        async_to_sync(channel_layer.group_send)(
            "mm_global",
            {
                "type": "game.event",
                "payload": {
                    "type": "enqueued",
                    "time_control": time_control,
                },
            },
        )
        # Broadcast pool sizes
        try:
            pools = {tc: r.zcard(f"mm:{tc}:z") for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]}
            async_to_sync(channel_layer.group_send)(
                "mm_global",
                {"type": "game.event", "payload": {"type": "mm_status", "pools": pools}},
            )
        except Exception:
            pass
        return Response({"detail": "Enqueued"}, status=status.HTTP_200_OK)


class CancelQueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        time_control = request.data.get("time_control")
        if not time_control:
            try:
                r = get_redis()
                for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]:
                    r.zrem(f"mm:{tc}:z", request.user.id)
                    r.hdel(f"mm:{tc}:ts", request.user.id)
                channel_layer = get_channel_layer()
                pools = {tc: r.zcard(f"mm:{tc}:z") for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]}
                async_to_sync(channel_layer.group_send)(
                    "mm_global",
                    {"type": "game.event", "payload": {"type": "mm_status", "pools": pools}},
                )
            except Exception:
                pass
        else:
            try:
                r = get_redis()
                r.zrem(f"mm:{time_control}:z", request.user.id)
                r.hdel(f"mm:{time_control}:ts", request.user.id)
                channel_layer = get_channel_layer()
                pools = {tc: r.zcard(f"mm:{tc}:z") for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]}
                async_to_sync(channel_layer.group_send)(
                    "mm_global",
                    {"type": "game.event", "payload": {"type": "mm_status", "pools": pools}},
                )
            except Exception:
                pass
        return Response({"detail": "Cancelled"}, status=status.HTTP_200_OK)


class QueueStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        positions = {}
        try:
            r = get_redis()
            for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]:
                zkey = f"mm:{tc}:z"
                entries = r.zrange(zkey, 0, -1, withscores=True)
                ids = [int(e[0]) for e in entries]
                if request.user.id in ids:
                    positions[tc] = ids.index(request.user.id) + 1
            pools = {tc: r.zcard(f"mm:{tc}:z") for tc in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL]}
        except Exception:
            pools = {}
        return Response({"queues": positions, "pool_sizes": pools}, status=status.HTTP_200_OK)
