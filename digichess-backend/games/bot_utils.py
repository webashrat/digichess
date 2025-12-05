"""
Bot utilities for generating moves with different skill levels
Hybrid approach:
- Maia Chess (human-like neural network) for ratings 800-1900
- Stockfish (traditional engine) for ratings 1900-2500
"""
import chess
import chess.engine
import random
import os
from django.conf import settings
from pathlib import Path

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


def get_bot_move(board: chess.Board, bot_rating: int) -> chess.Move:
    """
    Get a move from a bot with a given rating.
    Hybrid approach:
    - Uses Maia Chess (human-like) for ratings 800-1900
    - Uses Stockfish (traditional) for ratings 1900-2500
    """
    # Try Maia first for lower ratings (more human-like)
    if MAIA_AVAILABLE and should_use_maia(bot_rating):
        maia_move = get_maia_move(board, bot_rating)
        if maia_move:
            return maia_move
        # Fall through to Stockfish if Maia fails
    
    # Use Stockfish for higher ratings or as fallback
    engine_path = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH"))
    
    if not engine_path or not Path(engine_path).exists():
        # Fallback: random legal move if Stockfish not available
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            raise ValueError("No legal moves available")
        return random.choice(legal_moves)
    
    try:
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            config = get_stockfish_config(bot_rating)
            
            # For ratings 2000+, use Elo-based strength limiting for accurate rating
            if config.get('use_elo_limit', False):
                # Enable Elo-based strength limiting
                engine.configure({
                    "UCI_LimitStrength": True,
                    "UCI_Elo": config['elo']
                })
            else:
                # For lower ratings, use Skill Level
                engine.configure({"Skill Level": config['skill']})
            
            # Get best move with depth and time limits
            limit = chess.engine.Limit(depth=config['depth'], time=config['time'])
            result = engine.play(board, limit)
            
            return result.move
    except Exception as e:
        # Fallback to random move if engine fails
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            raise ValueError("No legal moves available")
        return random.choice(legal_moves)


def get_bot_move_with_error(board: chess.Board, bot_rating: int) -> chess.Move:
    """
    Get a move from a bot that may make mistakes based on rating.
    Lower rated bots make more mistakes.
    """
    # Get the best move
    best_move = get_bot_move(board, bot_rating)
    
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

