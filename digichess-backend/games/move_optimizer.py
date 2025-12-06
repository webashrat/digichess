"""
Move processing optimizations inspired by Lichess
- Fast move validation
- Latency monitoring
- Optimistic updates
"""
import time
from typing import Optional, Tuple, Dict, Any
from django.core.cache import cache
import chess
import logging

logger = logging.getLogger(__name__)


class MoveLatencyMonitor:
    """
    Monitor move processing latency (like Lichess MoveLatMonitor)
    Tracks average move processing time to identify bottlenecks
    """
    
    def __init__(self):
        self._total_millis = 0
        self._count = 0
        self._cache_key = "move_latency:stats"
        self._load_from_cache()
    
    def _load_from_cache(self):
        """Load stats from Redis cache"""
        cached = cache.get(self._cache_key)
        if cached:
            self._total_millis = cached.get('total', 0)
            self._count = cached.get('count', 0)
    
    def _save_to_cache(self):
        """Save stats to Redis cache"""
        cache.set(self._cache_key, {
            'total': self._total_millis,
            'count': self._count
        }, 3600)  # Cache for 1 hour
    
    def record_micros(self, micros: int):
        """Record move processing time in microseconds"""
        millis = (micros / 1000)
        self._total_millis += millis
        self._count += 1
        
        # Save to cache periodically
        if self._count % 10 == 0:
            self._save_to_cache()
        
        logger.debug(f"Move latency: {millis:.2f}ms (avg: {self.average():.2f}ms)")
    
    def average(self) -> float:
        """Get average move processing time in milliseconds"""
        if self._count == 0:
            return 0.0
        return self._total_millis / self._count
    
    def record_move(self, fn):
        """Decorator to record move processing time"""
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = fn(*args, **kwargs)
                elapsed = time.perf_counter() - start
                self.record_micros(int(elapsed * 1_000_000))
                return result
            except Exception as e:
                elapsed = time.perf_counter() - start
                self.record_micros(int(elapsed * 1_000_000))
                raise e
        return wrapper


# Global latency monitor
latency_monitor = MoveLatencyMonitor()


def validate_move_fast(board: chess.Board, move_str: str) -> Tuple[bool, Optional[str], Optional[chess.Move]]:
    """
    Ultra-fast move validation using chess.py
    Returns: (is_valid, error_message, move_object)
    """
    try:
        # Try SAN first (most common)
        try:
            move = board.parse_san(move_str)
        except ValueError:
            # Fallback to UCI
            move = board.parse_uci(move_str)
        
        if move in board.legal_moves:
            return True, None, move
        else:
            return False, "Illegal move: not in legal moves", None
    
    except (ValueError, chess.InvalidMoveError) as e:
        return False, f"Invalid move: {str(e)}", None
    except Exception as e:
        logger.error(f"Move validation error: {e}")
        return False, f"Validation error: {str(e)}", None


def process_move_optimized(
    game: 'Game',
    move_str: str,
    board: chess.Board
) -> Tuple[bool, Optional[str], Optional[chess.Move], Dict[str, Any]]:
    """
    Optimized move processing with latency tracking
    Returns: (success, error_msg, move, extra_data)
    """
    start_time = time.perf_counter()
    
    try:
        # Fast validation
        is_valid, error_msg, move = validate_move_fast(board, move_str)
        
        if not is_valid or not move:
            return False, error_msg, None, {}
        
        # Get SAN notation before applying move (board.san() needs the move to be in legal_moves)
        move_san = board.san(move)
        
        # Apply move
        board.push(move)
        
        # Prepare response data (minimal processing)
        extra_data = {
            'san': move_san,
            'uci': move.uci(),
            'fen': board.fen(),
            'legal_moves': [board.san(m) for m in board.legal_moves[:10]],  # Limit to 10 for performance
            'is_check': board.is_check(),
            'is_checkmate': board.is_checkmate(),
            'is_stalemate': board.is_stalemate(),
        }
        
        # Record latency
        elapsed = time.perf_counter() - start_time
        latency_monitor.record_micros(int(elapsed * 1_000_000))
        
        return True, None, move, extra_data
    
    except Exception as e:
        logger.error(f"Move processing error: {e}")
        elapsed = time.perf_counter() - start_time
        latency_monitor.record_micros(int(elapsed * 1_000_000))
        return False, str(e), None, {}

