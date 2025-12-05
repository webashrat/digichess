"""
Bot utilities for generating moves with different skill levels
Based on rating system: 800-2500 maps to Stockfish skill/depth/time
"""
import chess
import chess.engine
import random
import os
from django.conf import settings
from pathlib import Path


def get_stockfish_config(bot_rating: int):
    """
    Map bot rating (800-2500) to Stockfish skill level, depth, and time.
    Based on chess.com's AI level system:
    - Level 1: skill 3/20, depth 1, 50ms
    - Level 8: skill 20/20, depth 12, 400ms
    
    We map 800-2500 to similar levels:
    - 800-1000: skill 3-6, depth 1-2, 50-100ms
    - 1000-1500: skill 6-11, depth 2-4, 100-200ms
    - 1500-2000: skill 11-17, depth 4-8, 200-300ms
    - 2000-2500: skill 17-20, depth 8-12, 300-400ms
    """
    # Normalize rating to 0-1 range (800-2500)
    normalized = (bot_rating - 800) / 1700.0  # 2500 - 800 = 1700
    normalized = max(0.0, min(1.0, normalized))
    
    # Map to skill level (0-20)
    skill = int(3 + normalized * 17)  # 3 to 20
    
    # Map to depth (1-12)
    if normalized < 0.2:  # 800-1140
        depth = 1
    elif normalized < 0.4:  # 1140-1480
        depth = 2
    elif normalized < 0.5:  # 1480-1650
        depth = 3
    elif normalized < 0.6:  # 1650-1820
        depth = 4
    elif normalized < 0.7:  # 1820-1990
        depth = 6
    elif normalized < 0.85:  # 1990-2245
        depth = 8
    elif normalized < 0.95:  # 2245-2415
        depth = 10
    else:  # 2415-2500
        depth = 12
    
    # Map to time in seconds (50ms to 400ms)
    time_ms = int(50 + normalized * 350)  # 50ms to 400ms
    time_seconds = time_ms / 1000.0
    
    return {
        'skill': skill,
        'depth': depth,
        'time': time_seconds
    }


def get_bot_move(board: chess.Board, bot_rating: int) -> chess.Move:
    """
    Get a move from a bot with a given rating.
    Uses Stockfish with skill level, depth, and time based on rating.
    """
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
            
            # Set skill level
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

