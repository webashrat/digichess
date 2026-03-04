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


TIME_CONTROL_MULTIPLIER = {
    'bullet': 0.35,
    'blitz': 0.7,
    'rapid': 1.0,
    'classical': 1.0,
}


def get_stockfish_config(bot_rating: int, time_control: str = "blitz"):
    """
    Map bot rating (800-2800+) to Stockfish configuration.

    Master tier (2500+): Full Stockfish strength, no Elo limiting.
    Expert tier (2000-2499): UCI_LimitStrength with +300 Elo offset to match
        FIDE-equivalent strength (Stockfish UCI_Elo is CCRL-scale, ~300 below
        Lichess/FIDE ratings).  No depth cap — the Elo limiter handles weakness.
    Below 2000: Skill Level system for Maia-engine bots.

    Think time scales with time control: bullet=35%, blitz=70%, rapid/classical=100%.
    """
    tc_mult = TIME_CONTROL_MULTIPLIER.get(time_control, 0.7)

    if bot_rating >= 2500:
        if bot_rating < 2700:
            time_ms = 1500
        else:
            time_ms = 2000
        return {
            'use_elo_limit': False,
            'skill': 20,
            'depth': None,
            'time': max(0.15, time_ms * tc_mult / 1000.0),
        }

    if bot_rating >= 2000:
        elo = max(1320, min(3190, bot_rating + 300))

        if bot_rating < 2100:
            time_ms = 600
        elif bot_rating < 2200:
            time_ms = 700
        elif bot_rating < 2300:
            time_ms = 800
        elif bot_rating < 2400:
            time_ms = 900
        else:
            time_ms = 1000

        return {
            'use_elo_limit': True,
            'elo': elo,
            'depth': None,
            'time': max(0.15, time_ms * tc_mult / 1000.0),
        }

    normalized = (bot_rating - 800) / 1200.0
    normalized = max(0.0, min(1.0, normalized))

    skill = int(3 + normalized * 14)

    if normalized < 0.2:
        depth = 1
    elif normalized < 0.4:
        depth = 2
    elif normalized < 0.5:
        depth = 3
    elif normalized < 0.6:
        depth = 4
    elif normalized < 0.7:
        depth = 5
    elif normalized < 0.85:
        depth = 6
    else:
        depth = 8

    time_ms = int(50 + normalized * 250)

    return {
        'use_elo_limit': False,
        'skill': skill,
        'depth': depth,
        'time': time_ms / 1000.0
    }


def _stockfish_move(board: chess.Board, bot_rating: int, time_control: str = "blitz"):
    """Get a move from Stockfish with rating-appropriate configuration."""
    try:
        from games.stockfish_utils import get_stockfish_path, ensure_stockfish_works
        engine_path = get_stockfish_path()
        ok, msg, engine_path = ensure_stockfish_works(engine_path)
        if not ok:
            logger.warning(f"Stockfish unavailable: {msg}")
            return None
        config = get_stockfish_config(bot_rating, time_control)
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            if config.get('use_elo_limit'):
                engine.configure({
                    "UCI_LimitStrength": True,
                    "UCI_Elo": config.get('elo')
                })
            else:
                engine.configure({
                    "UCI_LimitStrength": False,
                    "Skill Level": config.get('skill', 20),
                })
            limit_kwargs = {'time': config.get('time', 0.2)}
            if config.get('depth'):
                limit_kwargs['depth'] = config['depth']
            limit = chess.engine.Limit(**limit_kwargs)
            result = engine.play(board, limit)
            if result and result.move in board.legal_moves:
                return result.move
    except Exception as exc:
        logger.warning(f"Stockfish failed: {exc}")
    return None


def get_bot_move(
    board: chess.Board,
    bot_rating: int,
    time_control: str = "blitz",
    ply_count: int = 0,
    engine: str = "maia",
) -> chess.Move:
    """
    Get a move from a bot with a given rating.

    engine="maia"  -> Tablebase / Opening Explorer / Maia NN / Stockfish fallback
    engine="stockfish" -> Tablebase / Opening Explorer / Stockfish direct (skips Maia)
    """
    # Strategy 1: Endgame tablebase (both engine paths)
    if LICHESS_AVAILABLE and is_endgame_position(board):
        tablebase_move_uci = get_tablebase_move(board)
        if tablebase_move_uci:
            try:
                tablebase_move = chess.Move.from_uci(tablebase_move_uci)
                if tablebase_move in board.legal_moves:
                    return tablebase_move
            except Exception:
                pass

    # Strategy 2: Opening explorer (both engine paths)
    if LICHESS_AVAILABLE and ply_count < 20:
        opening_move_uci = get_opening_move_from_explorer(board, time_control=time_control)
        if opening_move_uci:
            try:
                opening_move = chess.Move.from_uci(opening_move_uci)
                if opening_move in board.legal_moves:
                    return opening_move
            except Exception:
                pass

    # Strategy 3: Engine-specific mid-game path
    if engine == "stockfish":
        move = _stockfish_move(board, bot_rating, time_control)
        if move:
            return move
    else:
        if MAIA_AVAILABLE and should_use_maia(bot_rating):
            try:
                maia_move = get_maia_move(board, bot_rating)
                if maia_move and maia_move in board.legal_moves:
                    return maia_move
            except Exception as exc:
                logger.warning(f"Maia move failed, falling back to Stockfish: {exc}")
        else:
            logger.info("Maia unavailable or rating outside range; using Stockfish fallback.")

        move = _stockfish_move(board, bot_rating, time_control)
        if move:
            return move

    # Last-resort random legal move
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise RuntimeError("No legal moves available.")
    return random.choice(legal_moves)


def get_bot_move_with_error(
    board: chess.Board,
    bot_rating: int,
    time_control: str = "blitz",
    ply_count: int = 0,
    engine: str = "maia",
) -> chess.Move:
    """
    Get a move from a bot that may make mistakes based on rating and engine type.
    Maia bots: higher error rate (human-like mistakes).
    Stockfish bots: much lower error rate (engine-strong).
    """
    best_move = get_bot_move(
        board, bot_rating, time_control=time_control,
        ply_count=ply_count, engine=engine,
    )

    if engine == "stockfish":
        # Engine bots: 5% error at 2000, tapering to 0% at 2600+
        normalized = min(1.0, max(0.0, (bot_rating - 2000) / 600.0))
        error_probability = 0.05 * (1.0 - normalized)
    else:
        # Maia bots: 30% error at 800, tapering to 2% at 2500
        normalized = (bot_rating - 800) / 1700.0
        error_probability = 0.30 - normalized * 0.28

    if random.random() < error_probability:
        legal_moves = list(board.legal_moves)
        if len(legal_moves) > 1:
            legal_moves.remove(best_move)
            return random.choice(legal_moves)

    return best_move

