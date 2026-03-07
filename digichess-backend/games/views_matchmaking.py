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


LEGACY_QUEUE_CONFIGS = {
    Game.TIME_BULLET: {
        "queue_key": Game.TIME_BULLET,
        "time_control": Game.TIME_BULLET,
        "initial_time_seconds": 60,
        "increment_seconds": 0,
    },
    Game.TIME_BLITZ: {
        "queue_key": Game.TIME_BLITZ,
        "time_control": Game.TIME_BLITZ,
        "initial_time_seconds": 180,
        "increment_seconds": 0,
    },
    Game.TIME_RAPID: {
        "queue_key": Game.TIME_RAPID,
        "time_control": Game.TIME_RAPID,
        "initial_time_seconds": 600,
        "increment_seconds": 0,
    },
    Game.TIME_CLASSICAL: {
        "queue_key": Game.TIME_CLASSICAL,
        "time_control": Game.TIME_CLASSICAL,
        "initial_time_seconds": 1800,
        "increment_seconds": 10,
    },
}

MATCHMAKING_PRESET_CONFIGS = {
    "bullet_1_0": {
        "queue_key": "bullet_1_0",
        "time_control": Game.TIME_BULLET,
        "initial_time_seconds": 60,
        "increment_seconds": 0,
    },
    "bullet_2_1": {
        "queue_key": "bullet_2_1",
        "time_control": Game.TIME_BULLET,
        "initial_time_seconds": 120,
        "increment_seconds": 1,
    },
    "blitz_3_0": {
        "queue_key": "blitz_3_0",
        "time_control": Game.TIME_BLITZ,
        "initial_time_seconds": 180,
        "increment_seconds": 0,
    },
    "blitz_3_2": {
        "queue_key": "blitz_3_2",
        "time_control": Game.TIME_BLITZ,
        "initial_time_seconds": 180,
        "increment_seconds": 2,
    },
    "blitz_5_0": {
        "queue_key": "blitz_5_0",
        "time_control": Game.TIME_BLITZ,
        "initial_time_seconds": 300,
        "increment_seconds": 0,
    },
    "blitz_5_3": {
        "queue_key": "blitz_5_3",
        "time_control": Game.TIME_BLITZ,
        "initial_time_seconds": 300,
        "increment_seconds": 3,
    },
    "rapid_10_0": {
        "queue_key": "rapid_10_0",
        "time_control": Game.TIME_RAPID,
        "initial_time_seconds": 600,
        "increment_seconds": 0,
    },
    "rapid_10_5": {
        "queue_key": "rapid_10_5",
        "time_control": Game.TIME_RAPID,
        "initial_time_seconds": 600,
        "increment_seconds": 5,
    },
    "rapid_15_10": {
        "queue_key": "rapid_15_10",
        "time_control": Game.TIME_RAPID,
        "initial_time_seconds": 900,
        "increment_seconds": 10,
    },
    "classical_30_0": {
        "queue_key": "classical_30_0",
        "time_control": Game.TIME_CLASSICAL,
        "initial_time_seconds": 1800,
        "increment_seconds": 0,
    },
    "classical_30_20": {
        "queue_key": "classical_30_20",
        "time_control": Game.TIME_CLASSICAL,
        "initial_time_seconds": 1800,
        "increment_seconds": 20,
    },
}

MATCHMAKING_QUEUE_CONFIGS = {
    **LEGACY_QUEUE_CONFIGS,
    **MATCHMAKING_PRESET_CONFIGS,
}

TIME_CONTROL_TO_QUEUE_KEYS = {}
for _queue_key, _config in MATCHMAKING_QUEUE_CONFIGS.items():
    TIME_CONTROL_TO_QUEUE_KEYS.setdefault(_config["time_control"], []).append(_queue_key)


def _queue_zkey(queue_key):
    return f"mm:{queue_key}:z"


def _queue_tkey(queue_key):
    return f"mm:{queue_key}:ts"


def _resolve_queue_config(payload):
    queue_key = payload.get("queue_key")
    if queue_key:
        return MATCHMAKING_QUEUE_CONFIGS.get(queue_key)
    time_control = payload.get("time_control")
    if time_control:
        return LEGACY_QUEUE_CONFIGS.get(time_control)
    return None


def _resolve_queue_keys_for_cancel(payload):
    queue_key = payload.get("queue_key")
    if queue_key and queue_key in MATCHMAKING_QUEUE_CONFIGS:
        return [queue_key]
    time_control = payload.get("time_control")
    if time_control and time_control in TIME_CONTROL_TO_QUEUE_KEYS:
        return TIME_CONTROL_TO_QUEUE_KEYS[time_control]
    return list(MATCHMAKING_QUEUE_CONFIGS.keys())


def _remove_user_from_queues(redis_client, user_id, queue_keys):
    for queue_key in queue_keys:
        redis_client.zrem(_queue_zkey(queue_key), user_id)
        redis_client.hdel(_queue_tkey(queue_key), user_id)


def _get_pool_sizes(redis_client):
    return {
        queue_key: redis_client.zcard(_queue_zkey(queue_key))
        for queue_key in MATCHMAKING_QUEUE_CONFIGS
    }


class EnqueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        config = _resolve_queue_config(request.data)
        if not config:
            return Response({"detail": "Only rated pools allowed for matchmaking."}, status=status.HTTP_400_BAD_REQUEST)
        queue_key = config["queue_key"]
        time_control = config["time_control"]

        if Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(white=request.user).exists() or Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(black=request.user).exists():
            return Response({"detail": "You are already in an active game."}, status=status.HTTP_400_BAD_REQUEST)

        r = get_redis()
        zkey = _queue_zkey(queue_key)
        tkey = _queue_tkey(queue_key)
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
            _remove_user_from_queues(r, request.user.id, MATCHMAKING_QUEUE_CONFIGS.keys())
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
                    "initial_time_seconds": config["initial_time_seconds"],
                    "increment_seconds": config["increment_seconds"],
                }
                serializer = GameSerializer(data=payload, context={"request": request, "matchmaking": True})
                serializer.is_valid(raise_exception=True)
                game = serializer.save()
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f"user_{opponent.id}",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "match_found",
                            "game_id": game.id,
                            "queue_key": queue_key,
                            "time_control": time_control,
                        },
                    },
                )
                async_to_sync(channel_layer.group_send)(
                    "mm_global",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "match_found",
                            "game_id": game.id,
                            "queue_key": queue_key,
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
            {
                "type": "game.event",
                "payload": {
                    "type": "enqueued",
                    "queue_key": queue_key,
                    "time_control": time_control,
                },
            },
        )
        async_to_sync(channel_layer.group_send)(
            "mm_global",
            {
                "type": "game.event",
                "payload": {
                    "type": "enqueued",
                    "queue_key": queue_key,
                    "time_control": time_control,
                },
            },
        )
        # Broadcast pool sizes
        try:
            pools = _get_pool_sizes(r)
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
        try:
            r = get_redis()
            queue_keys = _resolve_queue_keys_for_cancel(request.data)
            _remove_user_from_queues(r, request.user.id, queue_keys)
            channel_layer = get_channel_layer()
            pools = _get_pool_sizes(r)
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
            for queue_key in MATCHMAKING_QUEUE_CONFIGS:
                zkey = _queue_zkey(queue_key)
                entries = r.zrange(zkey, 0, -1, withscores=True)
                ids = [int(e[0]) for e in entries]
                if request.user.id in ids:
                    positions[queue_key] = ids.index(request.user.id) + 1
            pools = _get_pool_sizes(r)
        except Exception:
            pools = {}
        return Response({"queues": positions, "pool_sizes": pools}, status=status.HTTP_200_OK)
