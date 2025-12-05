"""
Maia Chess integration for human-like bot moves
Uses Maia neural network models for ratings 800-1900
Falls back to Stockfish for ratings 1900-2500
"""
import chess
import chess.engine
import random
import os
import subprocess
import tempfile
from pathlib import Path
from django.conf import settings
from typing import Optional


# Maia model ratings available
MAIA_MODELS = {
    1100: "maia-1100.pb.gz",
    1200: "maia-1200.pb.gz",
    1300: "maia-1300.pb.gz",
    1400: "maia-1400.pb.gz",
    1500: "maia-1500.pb.gz",
    1600: "maia-1600.pb.gz",
    1700: "maia-1700.pb.gz",
    1800: "maia-1800.pb.gz",
    1900: "maia-1900.pb.gz",
}

# Maia model download URLs
MAIA_DOWNLOAD_URLS = {
    1100: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz",
    1200: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1200.pb.gz",
    1300: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1300.pb.gz",
    1400: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1400.pb.gz",
    1500: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1500.pb.gz",
    1600: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1600.pb.gz",
    1700: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1700.pb.gz",
    1800: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1800.pb.gz",
    1900: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz",
}


def get_maia_model_path(rating: int) -> Optional[Path]:
    """
    Get the path to the Maia model file for a given rating.
    Maps bot rating to the closest available Maia model.
    """
    # Map rating to closest Maia model
    if rating < 1050:
        model_rating = 1100
    elif rating < 1250:
        model_rating = 1200
    elif rating < 1350:
        model_rating = 1300
    elif rating < 1450:
        model_rating = 1400
    elif rating < 1550:
        model_rating = 1500
    elif rating < 1650:
        model_rating = 1600
    elif rating < 1750:
        model_rating = 1700
    elif rating < 1850:
        model_rating = 1800
    else:
        model_rating = 1900
    
    # Get model directory from settings or use default
    maia_dir = getattr(settings, "MAIA_MODELS_DIR", None)
    if not maia_dir:
        # Default to games/maia_models directory
        maia_dir = Path(__file__).parent / "maia_models"
    else:
        maia_dir = Path(maia_dir)
    
    maia_dir.mkdir(parents=True, exist_ok=True)
    
    model_file = maia_dir / MAIA_MODELS[model_rating]
    return model_file if model_file.exists() else None


def get_lc0_path() -> Optional[Path]:
    """Get the path to lc0 (Leela Chess Zero) executable"""
    lc0_path = getattr(settings, "LC0_PATH", os.getenv("LC0_PATH"))
    if lc0_path:
        lc0_path = Path(lc0_path)
        if lc0_path.exists():
            return lc0_path
    
    # Try common locations
    common_paths = [
        Path("/usr/local/bin/lc0"),
        Path("/usr/bin/lc0"),
        Path.home() / ".local/bin/lc0",
        Path("/tmp/lc0"),  # Temporary location
        Path(__file__).parent.parent / "lc0",  # In project directory
    ]
    
    for path in common_paths:
        if path.exists():
            return path
    
    return None


def get_maia_move_via_lc0(board: chess.Board, bot_rating: int, timeout: float = 1.0) -> Optional[chess.Move]:
    """
    Get a move from Maia using lc0 engine via UCI protocol.
    This is the recommended approach if lc0 is available.
    """
    model_path = get_maia_model_path(bot_rating)
    lc0_path = get_lc0_path()
    
    if not model_path or not lc0_path:
        return None
    
    try:
        # Use python-chess UCI interface to communicate with lc0
        import chess.engine
        
        # Start lc0 engine (weights are set via UCI command, not command line)
        cmd = [str(lc0_path)]
        
        with chess.engine.SimpleEngine.popen_uci(cmd) as engine:
            # Set the weights file via UCI option
            try:
                engine.configure({"WeightsFile": str(model_path)})
            except Exception:
                # If configure fails, try setting weights via command line argument
                # Some versions of lc0 support --weights flag
                pass
            
            # Get move with time limit (use nodes=1 for speed, like Maia example)
            # engine.play() automatically sets the position from the board
            limit = chess.engine.Limit(nodes=1, time=timeout)
            result = engine.play(board, limit)
            
            if result.move and result.move in board.legal_moves:
                return result.move
        
        return None
    except Exception as e:
        print(f"[maia] Error getting move via lc0: {e}")
        return None


def get_maia_move_via_python(board: chess.Board, bot_rating: int) -> Optional[chess.Move]:
    """
    Get a move from Maia using Python wrapper (if available).
    This requires the maia-chess Python package or custom wrapper.
    """
    try:
        # Try to import Maia Python wrapper
        # Note: This would require installing maia-chess package or implementing wrapper
        # For now, return None to indicate Python wrapper not available
        return None
    except ImportError:
        return None


def get_maia_move(board: chess.Board, bot_rating: int) -> Optional[chess.Move]:
    """
    Get a move from Maia neural network model.
    Tries lc0 first, then Python wrapper, then returns None.
    """
    # Try lc0 first (most reliable)
    move = get_maia_move_via_lc0(board, bot_rating)
    if move:
        return move
    
    # Try Python wrapper as fallback
    move = get_maia_move_via_python(board, bot_rating)
    if move:
        return move
    
    return None


def should_use_maia(bot_rating: int) -> bool:
    """
    Determine if we should use Maia for this rating.
    Use Maia for ratings 800-1900, Stockfish for 1900-2500.
    """
    return 800 <= bot_rating <= 1900

