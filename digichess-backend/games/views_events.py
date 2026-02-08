from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from utils.redis_client import get_redis
from .models import Game
from .serializers import GameSerializer


class GameEventsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        since_raw = request.query_params.get("since") or "0"
        try:
            since = int(since_raw)
        except ValueError:
            since = 0

        events = []
        last_seq = since
        r = None
        try:
            r = get_redis()
        except Exception:
            r = None

        if r:
            try:
                last_seq = int(r.get(f"game:seq:{game.id}") or 0)
                if last_seq > since:
                    entries = r.xrevrange(f"game:events:{game.id}", count=200)
                    for _, fields in reversed(entries):
                        try:
                            seq = int(fields.get("seq") or 0)
                        except Exception:
                            seq = 0
                        if seq <= since:
                            continue
                        event = {}
                        for key, value in fields.items():
                            if key in {"white_time_left", "black_time_left", "move_count", "seq"}:
                                try:
                                    event[key] = int(value)
                                except Exception:
                                    event[key] = value
                            else:
                                event[key] = value
                        event["seq"] = seq or event.get("seq", 0)
                        events.append(event)
            except Exception:
                events = []

        if not events and last_seq > since:
            events = [{"type": "gameFull", "game": GameSerializer(game).data, "seq": last_seq}]

        return Response({"events": events, "last_seq": last_seq})
