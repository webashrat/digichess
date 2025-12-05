from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from utils.redis_client import get_redis
import chess

from .models import Game


class LiveClockView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        
        # If game is not active, return 404
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active"}, status=status.HTTP_404_NOT_FOUND)
        
        try:
            r = get_redis()
            data = r.hgetall(f"game:clock:{pk}")
            
            # If Redis has data, use it
            if data:
                # Determine turn from board state
                try:
                    board = chess.Board(game.current_fen or chess.STARTING_FEN)
                    turn = "white" if board.turn is chess.WHITE else "black"
                except Exception:
                    turn = "white"  # Default fallback
                
                return Response(
                    {
                        "white_time_left": int(data.get("white_time_left", 0)),
                        "black_time_left": int(data.get("black_time_left", 0)),
                        "last_move_at": int(data.get("last_move_at", 0)),
                        "turn": turn,
                    }
                )
        except Exception:
            pass  # Fall through to database fallback
        
        # Fallback to database if Redis doesn't have data
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
            turn = "white" if board.turn is chess.WHITE else "black"
        except Exception:
            turn = "white"  # Default fallback
        
        # Initialize clock in Redis from database
        try:
            r = get_redis()
            from django.utils import timezone
            r.hset(
                f"game:clock:{game.id}",
                mapping={
                    "white_time_left": game.white_time_left,
                    "black_time_left": game.black_time_left,
                    "last_move_at": int(game.last_move_at.timestamp() if game.last_move_at else timezone.now().timestamp()),
                    "turn": turn,
                },
            )
        except Exception:
            pass  # Continue even if Redis write fails
        
        return Response(
            {
                "white_time_left": game.white_time_left,
                "black_time_left": game.black_time_left,
                "last_move_at": int(game.last_move_at.timestamp() if game.last_move_at else 0),
                "turn": turn,
            }
        )
