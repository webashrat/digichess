"""
Optimistic move endpoint for instant UI feedback
Uses Lichess APIs for fast validation
"""
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
import chess

from .models import Game
from .lichess_game_flow import validate_move_fast, get_instant_move_feedback


class OptimisticMoveView(APIView):
    """
    Fast move validation endpoint for optimistic UI updates.
    Returns immediately without saving the move.
    Client can show move instantly, then confirm with regular move endpoint.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, pk: int):
        """
        Validate move quickly and return feedback.
        Does NOT save the move - use regular /move/ endpoint for that.
        """
        game = get_object_or_404(Game, id=pk)
        
        # Check if user is part of this game
        if game.white != request.user and game.black != request.user:
            return Response(
                {"detail": "You are not part of this game."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if game is active
        if game.status != Game.STATUS_ACTIVE:
            return Response(
                {"detail": "Game is not active."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Load board
        board = chess.Board(game.current_fen or chess.STARTING_FEN)
        
        # Check if it's the user's turn
        current_player = game.white if board.turn == chess.WHITE else game.black
        if current_player != request.user:
            return Response(
                {"detail": "Not your turn."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get move from request
        move_san = request.data.get("move")
        if not move_san:
            return Response(
                {"detail": "Move is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Fast validation
        is_valid, error_msg, move = validate_move_fast(board, move_san)
        
        if not is_valid or not move:
            return Response(
                {
                    "valid": False,
                    "error": error_msg or "Illegal move"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get instant feedback (non-blocking, can be None)
        feedback = get_instant_move_feedback(board, move_san)
        
        # Apply move temporarily to get new position
        temp_board = board.copy()
        temp_board.push(move)
        
        # Calculate new legal moves
        new_legal_moves = [temp_board.san(mv) for mv in temp_board.legal_moves]
        
        return Response({
            "valid": True,
            "san": board.san(move),
            "uci": move.uci(),
            "fen_after": temp_board.fen(),
            "legal_moves_after": new_legal_moves,
            "is_check": temp_board.is_check(),
            "is_checkmate": temp_board.is_checkmate(),
            "is_stalemate": temp_board.is_stalemate(),
            "feedback": feedback,  # Optional evaluation feedback
        }, status=status.HTTP_200_OK)

