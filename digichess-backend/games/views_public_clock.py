from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from utils.redis_client import get_redis
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import chess

from .models import Game


class LiveClockView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        
        # If game is not active, return 404
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active"}, status=status.HTTP_404_NOT_FOUND)
        
        # Check for timeout - calculate elapsed time since last move
        now = timezone.now()
        elapsed = 0
        if game.last_move_at:
            elapsed = (now - game.last_move_at).total_seconds()
        
        # Determine whose turn it is
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
            turn = "white" if board.turn is chess.WHITE else "black"
            is_white_turn = board.turn == chess.WHITE
        except Exception:
            turn = "white"
            is_white_turn = True
        
        # Calculate current time left
        white_time_left = game.white_time_left
        black_time_left = game.black_time_left
        
        if game.last_move_at:
            if is_white_turn:
                white_time_left = max(0, game.white_time_left - int(elapsed))
                if white_time_left <= 0:
                    # Timeout - white lost
                    result = Game.RESULT_BLACK
                    game.finish(result)
                    game.refresh_from_db()
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        from games.views import FinishGameView
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event
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
            else:
                black_time_left = max(0, game.black_time_left - int(elapsed))
                if black_time_left <= 0:
                    # Timeout - black lost
                    result = Game.RESULT_WHITE
                    game.finish(result)
                    game.refresh_from_db()
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        from games.views import FinishGameView
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event
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
        
        try:
            r = get_redis()
            data = r.hgetall(f"game:clock:{pk}")
            
            # If Redis has data, use it (but use calculated times if they're more accurate)
            if data:
                return Response(
                    {
                        "white_time_left": white_time_left,
                        "black_time_left": black_time_left,
                        "last_move_at": int(data.get("last_move_at", 0)),
                        "turn": turn,
                    }
                )
        except Exception:
            pass  # Fall through to database fallback
        
        # Initialize clock in Redis from database
        try:
            r = get_redis()
            r.hset(
                f"game:clock:{game.id}",
                mapping={
                    "white_time_left": white_time_left,
                    "black_time_left": black_time_left,
                    "last_move_at": int(game.last_move_at.timestamp() if game.last_move_at else now.timestamp()),
                    "turn": turn,
                },
            )
        except Exception:
            pass  # Continue even if Redis write fails
        
        return Response(
            {
                "white_time_left": white_time_left,
                "black_time_left": black_time_left,
                "last_move_at": int(game.last_move_at.timestamp() if game.last_move_at else 0),
                "turn": turn,
            }
        )
