"""
Bot utilities for generating moves with different skill levels
Uses Maia Chess (human-like neural network) for all ratings 800-2400.
Optimized with Lichess API:
- Opening Explorer for early game (faster, more realistic)
- Tablebase for endgame (perfect play)
- Maia for mid-game (human-like)
"""
import chess
import chess.engine
import random
import os
from django.conf import settings
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Try to import Maia integration
try:
    from games.maia_integration import get_maia_move, should_use_maia
    MAIA_AVAILABLE = True
except ImportError:
    MAIA_AVAILABLE = False
    def get_maia_move(board, rating):
        return None
    def should_use_maia(rating):
        return False

# Try to import Lichess API utilities
try:
    from games.lichess_api import (
        get_opening_move_from_explorer,
        get_tablebase_move,
        is_endgame_position
    )
    LICHESS_AVAILABLE = True
except ImportError:
    LICHESS_AVAILABLE = False
    def get_opening_move_from_explorer(board, time_control="blitz", rating_range=None):
        return None
    def get_tablebase_move(board):
        return None
    def is_endgame_position(board):
        return False


def get_stockfish_config(bot_rating: int):
    """
    Map bot rating (800-2500) to Stockfish configuration.
    Uses UCI_LimitStrength and UCI_Elo for accurate rating matching (especially 2000-2500).
    Falls back to Skill Level for lower ratings.
    
    Stockfish Elo range: 1320-3190 (approximately)
    - For 2000-2500: Use UCI_LimitStrength=true with UCI_Elo matching bot rating
    - For 800-1999: Use Skill Level (0-20) with depth/time limits
    """
    # For ratings 2000+, use Elo-based strength limiting for accurate rating match
    if bot_rating >= 2000:
        # Stockfish Elo range is approximately 1320-3190
        # Clamp to valid range
        elo = max(1320, min(3190, bot_rating))
        
        # Calculate depth and time based on rating
        # Higher ratings get more depth/time, but still limited
        if bot_rating < 2100:
            depth = 8
            time_ms = 300
        elif bot_rating < 2200:
            depth = 9
            time_ms = 350
        elif bot_rating < 2300:
            depth = 10
            time_ms = 400
        elif bot_rating < 2400:
            depth = 11
            time_ms = 450
        else:  # 2400-2500
            depth = 12
            time_ms = 500
        
        return {
            'use_elo_limit': True,
            'elo': elo,
            'depth': depth,
            'time': time_ms / 1000.0
        }
    
    # For ratings below 2000, use Skill Level system
    # Normalize rating to 0-1 range (800-2000)
    normalized = (bot_rating - 800) / 1200.0  # 2000 - 800 = 1200
    normalized = max(0.0, min(1.0, normalized))
    
    # Map to skill level (0-20)
    # 800 rating = skill 3, 2000 rating = skill 17
    skill = int(3 + normalized * 14)  # 3 to 17
    
    # Map to depth (1-8)
    if normalized < 0.2:  # 800-1040
        depth = 1
    elif normalized < 0.4:  # 1040-1280
        depth = 2
    elif normalized < 0.5:  # 1280-1400
        depth = 3
    elif normalized < 0.6:  # 1400-1520
        depth = 4
    elif normalized < 0.7:  # 1520-1640
        depth = 5
    elif normalized < 0.85:  # 1640-1820
        depth = 6
    else:  # 1820-2000
        depth = 8
    
    # Map to time in seconds (50ms to 300ms)
    time_ms = int(50 + normalized * 250)  # 50ms to 300ms
    time_seconds = time_ms / 1000.0
    
    return {
        'use_elo_limit': False,
        'skill': skill,
        'depth': depth,
        'time': time_seconds
    }


def get_bot_move(board: chess.Board, bot_rating: int, time_control: str = "blitz", ply_count: int = 0) -> chess.Move:
    """
    Get a move from a bot with a given rating.
    Optimized with Lichess APIs for speed and accuracy:
    - Early game (ply < 20): Lichess Opening Explorer (fast, realistic)
    - Endgame (≤7 pieces): Lichess Tablebase (perfect play)
    - Mid-game: Maia Chess (human-like neural network)
    
    Rating ranges map to Maia models:
    - 800-1100 → maia-1100
    - 1101-1300 → maia-1200
    - 1301-1400 → maia-1300
    - 1401-1500 → maia-1400
    - 1501-1600 → maia-1500
    - 1601-1700 → maia-1600
    - 1701-1800 → maia-1700
    - 1801-1900 → maia-1800
    - 1901-2400 → maia-1900
    """
    # Strategy 1: Endgame - use tablebase for perfect play
    if LICHESS_AVAILABLE and is_endgame_position(board):
        tablebase_move_uci = get_tablebase_move(board)
        if tablebase_move_uci:
            try:
                tablebase_move = chess.Move.from_uci(tablebase_move_uci)
                if tablebase_move in board.legal_moves:
                    return tablebase_move
            except Exception:
                pass  # Fall through to Maia
    
    # Strategy 2: Early game - use opening explorer (first 20 moves)
    if LICHESS_AVAILABLE and ply_count < 20:
        opening_move_uci = get_opening_move_from_explorer(board, time_control=time_control)
        if opening_move_uci:
            try:
                opening_move = chess.Move.from_uci(opening_move_uci)
                if opening_move in board.legal_moves:
                    return opening_move
            except Exception:
                pass  # Fall through to Maia
    
    # Strategy 3: Mid-game - use Maia for human-like play
    if MAIA_AVAILABLE and should_use_maia(bot_rating):
        try:
            maia_move = get_maia_move(board, bot_rating)
            if maia_move and maia_move in board.legal_moves:
                return maia_move
        except Exception as exc:
            logger.warning(f"Maia move failed, falling back to Stockfish: {exc}")
    else:
        logger.info("Maia unavailable or rating outside range; using Stockfish fallback.")

    # Strategy 4: Fallback to Stockfish (fast + deterministic)
    try:
        from games.stockfish_utils import get_stockfish_path, ensure_stockfish_works
        engine_path = get_stockfish_path()
        ok, msg, engine_path = ensure_stockfish_works(engine_path)
        if ok:
            import chess.engine
            config = get_stockfish_config(bot_rating)
            with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                if config.get('use_elo_limit'):
                    engine.configure({
                        "UCI_LimitStrength": True,
                        "UCI_Elo": config.get('elo')
                    })
                else:
                    engine.configure({
                        "Skill Level": config.get('skill', 10)
                    })
                limit = chess.engine.Limit(time=config.get('time', 0.2), depth=config.get('depth', 8))
                result = engine.play(board, limit)
                if result and result.move in board.legal_moves:
                    return result.move
        else:
            logger.warning(f"Stockfish unavailable: {msg}")
    except Exception as exc:
        logger.warning(f"Stockfish fallback failed: {exc}")

    # Strategy 5: Last-resort random legal move
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise RuntimeError("No legal moves available.")
    return random.choice(legal_moves)


def get_bot_move_with_error(board: chess.Board, bot_rating: int, time_control: str = "blitz", ply_count: int = 0) -> chess.Move:
    """
    Get a move from a bot that may make mistakes based on rating.
    Lower rated bots make more mistakes.
    """
    # Get the best move
    best_move = get_bot_move(board, bot_rating, time_control=time_control, ply_count=ply_count)
    
    # Calculate error probability based on rating
    # 800 rating = 30% chance of error, 2500 rating = 2% chance of error
    normalized = (bot_rating - 800) / 1700.0
    error_probability = 0.30 - normalized * 0.28  # 30% to 2%
    
    if random.random() < error_probability:
        # Make a suboptimal move
        legal_moves = list(board.legal_moves)
        if len(legal_moves) > 1:
            # Remove the best move and pick a random one
            legal_moves.remove(best_move)
            return random.choice(legal_moves)
    
    return best_move

