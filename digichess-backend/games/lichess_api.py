"""
Lichess API integration for fast cloud-based chess features
Uses Lichess free API for:
- Cloud evaluation (fast Stockfish analysis)
- Opening explorer
- Tablebase (endgame database)
- Puzzle solving
"""
import requests
import chess
from typing import Optional, Dict, Any, List
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

LICHESS_API_BASE = "https://lichess.org/api"


def get_cloud_evaluation(fen: str, variant: str = "standard", multi_pv: int = 1, depth: int = 18) -> Optional[Dict[str, Any]]:
    """
    Get cloud evaluation from Lichess API.
    Fast and free - no local Stockfish needed!
    
    Args:
        fen: Position FEN string
        variant: Chess variant (standard, chess960, etc.)
        multi_pv: Number of principal variations (1-5)
        depth: Analysis depth (1-22, default 18)
    
    Returns:
        Dict with evaluation data or None if failed
    """
    try:
        url = f"{LICHESS_API_BASE}/cloud-eval"
        params = {
            "fen": fen,
            "multiPv": min(multi_pv, 5),  # Lichess limits to 5
            "depth": min(max(depth, 1), 22),  # Lichess limits depth
            "variant": variant
        }
        
        response = requests.get(url, params=params, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "fen": fen,
                "knodes": data.get("knodes", 0),
                "depth": data.get("depth", 0),
                "pvs": data.get("pvs", []),  # Principal variations
                "eval": data.get("pvs", [{}])[0].get("cp") if data.get("pvs") else None,
                "mate": data.get("pvs", [{}])[0].get("mate") if data.get("pvs") else None,
                "best_move": data.get("pvs", [{}])[0].get("moves", "").split()[0] if data.get("pvs") and data.get("pvs", [{}])[0].get("moves") else None
            }
        elif response.status_code == 429:
            logger.warning("Lichess API rate limit reached, falling back to local Stockfish")
            return None
        else:
            logger.warning(f"Lichess API returned {response.status_code}: {response.text}")
            return None
    except requests.RequestException as e:
        logger.warning(f"Lichess API request failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Error getting Lichess evaluation: {e}", exc_info=True)
        return None


def get_opening_explorer(fen: str, variant: str = "standard", speeds: List[str] = None, ratings: List[int] = None) -> Optional[Dict[str, Any]]:
    """
    Get opening explorer data from Lichess API.
    Shows popular moves in the position from Lichess database.
    
    Args:
        fen: Position FEN string
        variant: Chess variant
        speeds: List of time controls (ultraBullet, bullet, blitz, rapid, classical)
        ratings: List of rating ranges (0-1600, 1600-1800, 1800-2000, 2000-2200, 2200-2500, 2500+)
    
    Returns:
        Dict with opening moves data or None if failed
    """
    try:
        url = f"{LICHESS_API_BASE}/explorer"
        params = {
            "fen": fen,
            "variant": variant
        }
        
        if speeds:
            params["speeds"] = ",".join(speeds)
        if ratings:
            params["ratings"] = ",".join(map(str, ratings))
        
        response = requests.get(url, params=params, timeout=3)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "white": data.get("white", 0),
                "black": data.get("black", 0),
                "draws": data.get("draws", 0),
                "moves": data.get("moves", [])
            }
        else:
            logger.warning(f"Lichess explorer API returned {response.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Error getting Lichess opening explorer: {e}")
        return None


def get_tablebase(fen: str, variant: str = "standard") -> Optional[Dict[str, Any]]:
    """
    Get tablebase (endgame database) information from Lichess API.
    Provides perfect endgame play for positions with <= 7 pieces.
    
    Args:
        fen: Position FEN string
        variant: Chess variant
    
    Returns:
        Dict with tablebase data or None if failed
    """
    try:
        url = f"{LICHESS_API_BASE}/tablebase/{variant}"
        params = {"fen": fen}
        
        response = requests.get(url, params=params, timeout=3)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "dtz": data.get("dtz"),  # Distance to zeroing (pawn move or capture)
                "precise_dtz": data.get("preciseDtz"),
                "checkmate": data.get("checkmate", False),
                "stalemate": data.get("stalemate", False),
                "variant_win": data.get("variantWin", False),
                "variant_loss": data.get("variantLoss", False),
                "insufficient_material": data.get("insufficientMaterial", False),
                "category": data.get("category"),  # win, loss, draw, cursed-win, blessed-loss, maybe-win, maybe-loss
                "moves": data.get("moves", [])
            }
        else:
            logger.warning(f"Lichess tablebase API returned {response.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Error getting Lichess tablebase: {e}")
        return None


def analyze_position_with_lichess(board: chess.Board, depth: int = 18) -> Optional[Dict[str, Any]]:
    """
    Analyze a position using Lichess cloud evaluation.
    Fast and free - uses Lichess's Stockfish cluster.
    
    Returns:
        Dict with analysis result or None if failed
    """
    fen = board.fen()
    variant = "standard"  # Can be extended for other variants
    
    result = get_cloud_evaluation(fen, variant=variant, depth=depth)
    
    if result and result.get("pvs"):
        pv_data = result["pvs"][0]
        moves = pv_data.get("moves", "").split()
        
        return {
            "best_move": moves[0] if moves else None,
            "evaluation": pv_data.get("cp"),  # Centipawns
            "mate": pv_data.get("mate"),  # Mate in N moves
            "depth": result.get("depth", 0),
            "pv": moves,  # Principal variation
            "knodes": result.get("knodes", 0)
        }
    
    return None


def get_opening_move_from_explorer(board: chess.Board, time_control: str = "blitz", rating_range: List[int] = None) -> Optional[str]:
    """
    Get a popular opening move from Lichess explorer for bot games.
    This makes bots play more realistic opening moves.
    
    Args:
        board: Current board position
        time_control: Game time control (bullet, blitz, rapid, classical)
        rating_range: Rating ranges to filter (e.g., [1600, 1800, 2000])
    
    Returns:
        UCI move string or None
    """
    if rating_range is None:
        rating_range = [1600, 1800, 2000, 2200]
    
    speeds_map = {
        "bullet": ["bullet", "blitz"],
        "blitz": ["blitz", "rapid"],
        "rapid": ["rapid", "classical"],
        "classical": ["classical", "correspondence"]
    }
    speeds = speeds_map.get(time_control.lower(), ["blitz", "rapid"])
    
    explorer_data = get_opening_explorer(
        board.fen(),
        variant="standard",
        speeds=speeds,
        ratings=rating_range
    )
    
    if explorer_data and explorer_data.get("moves"):
        moves = explorer_data["moves"]
        # Sort by total games played
        moves_sorted = sorted(moves, key=lambda m: m.get("white", 0) + m.get("black", 0) + m.get("draws", 0), reverse=True)
        
        # Return top move if it has sufficient games
        if moves_sorted and (moves_sorted[0].get("white", 0) + moves_sorted[0].get("black", 0) + moves_sorted[0].get("draws", 0)) > 10:
            return moves_sorted[0].get("uci")
    
    return None


def get_opening_name(moves: List[str]) -> Optional[str]:
    """
    Get opening name from Lichess API by exporting game with opening tag.
    Note: This requires the full move sequence.
    Returns opening name if available.
    """
    # Lichess doesn't have a direct API for this, but we can infer from explorer
    # For now, return None - can be enhanced later with opening book lookup
    return None


def is_endgame_position(board: chess.Board) -> bool:
    """
    Check if position is an endgame (7 or fewer pieces) suitable for tablebase.
    """
    piece_count = len(board.piece_map())
    return piece_count <= 7


def get_tablebase_move(board: chess.Board) -> Optional[str]:
    """
    Get best move from tablebase for endgame positions.
    Returns perfect play for positions with <= 7 pieces.
    """
    if not is_endgame_position(board):
        return None
    
    tablebase_data = get_tablebase(board.fen())
    
    if tablebase_data and tablebase_data.get("moves"):
        moves = tablebase_data["moves"]
        # Sort by wdl (win-draw-loss) score, prefer wins/draws
        moves_sorted = sorted(
            moves,
            key=lambda m: m.get("wdl", -1),  # -1 = win, 0 = draw, 1 = loss
            reverse=False  # Lower is better (-1 wins)
        )
        
        if moves_sorted:
            return moves_sorted[0].get("uci")
    
    return None

