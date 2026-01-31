from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import chess

from .models import Game
from .game_core import compute_clock_snapshot


class LiveClockView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        
        # If game is not active, return 404
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active"}, status=status.HTTP_404_NOT_FOUND)
        
        now = timezone.now()
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            board = chess.Board()

        snapshot = compute_clock_snapshot(game, now=now, board=board)
        turn = snapshot["turn"]
        white_time_left = snapshot["white_time_left"]
        black_time_left = snapshot["black_time_left"]

        # Check timeout on the active side
        if turn == "white" and white_time_left <= 0:
            result = Game.RESULT_BLACK
        elif turn == "black" and black_time_left <= 0:
            result = Game.RESULT_WHITE
        else:
            result = None

        if result:
            game.white_time_left = white_time_left
            game.black_time_left = black_time_left
            game.status = Game.STATUS_FINISHED
            game.result = result
            game.finished_at = now
            game.save(
                update_fields=[
                    "status",
                    "result",
                    "finished_at",
                    "white_time_left",
                    "black_time_left",
                ]
            )
            game.refresh_from_db()
            if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                from games.views import FinishGameView
                FinishGameView().update_ratings(game, result)
            channel_layer = get_channel_layer()
            from games.serializers import GameSerializer
            game_data = GameSerializer(game).data
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": result,
                        "reason": "timeout",
                        "game": game_data,
                    },
                },
            )
            return Response({"detail": "Game finished - timeout"}, status=status.HTTP_404_NOT_FOUND)
        
        return Response(
            {
                "white_time_left": white_time_left,
                "black_time_left": black_time_left,
                "last_move_at": snapshot.get("last_move_at") or 0,
                "turn": turn,
            }
        )
