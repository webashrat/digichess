"""
Lichess API integration for smooth real-time game flow
- Fast move validation
- Optimistic updates
- Quick state synchronization
"""
import chess
import requests
from typing import Optional, Dict, Any, Tuple
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

LICHESS_API_BASE = "https://lichess.org/api"


def validate_move_fast(board: chess.Board, move_san: str) -> Tuple[bool, Optional[str], Optional[chess.Move]]:
    """
    Fast move validation using local chess.py (instant) + Lichess as backup.
    Returns: (is_valid, error_message, move_object)
    """
    # First, try local validation (instant)
    try:
        move = board.parse_san(move_san)
        if move in board.legal_moves:
            return True, None, move
        else:
            return False, "Illegal move: not in legal moves", None
    except chess.InvalidMoveError as e:
        return False, f"Invalid move format: {str(e)}", None
    except ValueError as e:
        # Try Lichess explorer as backup validation (check if move exists in database)
        # This is slower but can catch edge cases
        try:
            explorer_data = validate_move_with_explorer(board, move_san)
            if explorer_data:
                # Move exists in Lichess database, but still try to parse locally
                try:
                    move = board.parse_san(move_san)
                    if move in board.legal_moves:
                        return True, None, move
                except Exception:
                    pass
        except Exception:
            pass
        return False, f"Invalid move: {str(e)}", None
    except Exception as e:
        return False, f"Validation error: {str(e)}", None


def validate_move_with_explorer(board: chess.Board, move_san: str) -> Optional[Dict[str, Any]]:
    """
    Validate move using Lichess opening explorer.
    Returns explorer data if move is found in database.
    """
    try:
        from .lichess_api import get_opening_explorer
        
        explorer_data = get_opening_explorer(board.fen(), variant="standard")
        if explorer_data and explorer_data.get("moves"):
            # Check if move exists in explorer moves
            move_uci = None
            try:
                move_obj = board.parse_san(move_san)
                move_uci = move_obj.uci()
            except Exception:
                return None
            
            for move_data in explorer_data["moves"]:
                if move_data.get("uci") == move_uci:
                    return move_data
    except Exception as e:
        logger.debug(f"Explorer validation failed: {e}")
    return None


def get_game_state_export(fen: str, moves: str, variant: str = "standard") -> Optional[Dict[str, Any]]:
    """
    Get game state in Lichess-like format for quick synchronization.
    This doesn't use Lichess API, but formats data like Lichess does for consistency.
    """
    try:
        board = chess.Board(fen) if fen != chess.STARTING_FEN else chess.Board()
        moves_list = moves.split() if moves else []
        
        # Reconstruct board from moves if needed
        if moves_list and fen == chess.STARTING_FEN:
            temp_board = chess.Board()
            for move_san in moves_list:
                try:
                    move = temp_board.parse_san(move_san)
                    temp_board.push(move)
                except Exception:
                    break
            board = temp_board
        
        legal_moves_uci = [move.uci() for move in board.legal_moves]
        legal_moves_san = [board.san(move) for move in board.legal_moves]
        
        return {
            "fen": board.fen(),
            "moves": " ".join(moves_list),
            "legal_moves": {
                "uci": legal_moves_uci,
                "san": legal_moves_san
            },
            "turn": "white" if board.turn == chess.WHITE else "black",
            "is_check": board.is_check(),
            "is_checkmate": board.is_checkmate(),
            "is_stalemate": board.is_stalemate(),
            "is_draw": board.is_stalemate() or board.is_insufficient_material() or board.can_claim_fifty_moves() or board.can_claim_threefold_repetition(),
        }
    except Exception as e:
        logger.error(f"Error generating game state export: {e}")
        return None


def get_instant_move_feedback(board: chess.Board, move_san: str) -> Optional[Dict[str, Any]]:
    """
    Get instant move feedback using Lichess cloud eval (if available).
    This provides immediate visual feedback to user while move is being processed.
    """
    try:
        # Apply move temporarily
        temp_board = board.copy()
        try:
            move = temp_board.parse_san(move_san)
            if move not in temp_board.legal_moves:
                return None
            temp_board.push(move)
        except Exception:
            return None
        
        # Get quick evaluation from Lichess (non-blocking, can be None)
        from .lichess_api import get_cloud_evaluation
        eval_data = get_cloud_evaluation(temp_board.fen(), depth=12, multi_pv=1)
        
        if eval_data and eval_data.get("pvs"):
            pv_data = eval_data["pvs"][0]
            return {
                "evaluation": pv_data.get("cp"),  # Centipawns
                "mate": pv_data.get("mate"),
                "depth": eval_data.get("depth", 0),
                "best_move_hint": pv_data.get("moves", "").split()[0] if pv_data.get("moves") else None
            }
    except Exception:
        pass  # Fail silently - this is just bonus feedback
    return None

