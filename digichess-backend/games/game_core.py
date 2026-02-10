import logging
import uuid
from datetime import timedelta
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import chess
from django.db import transaction
from django.utils import timezone

from utils.redis_client import get_redis
from .models import Game
from .move_optimizer import process_move_optimized

logger = logging.getLogger(__name__)

LOCK_TTL_SECONDS = 5
EVENT_STREAM_MAXLEN = 10000
FIRST_MOVE_GRACE_SECONDS = 20
CHALLENGE_EXPIRY_MINUTES = 10

_RELEASE_LOCK_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
"""


@dataclass
class MoveResult:
    ok: bool
    error: Optional[str] = None
    game: Optional[Game] = None
    state: Optional[Dict[str, Any]] = None
    legal_moves: Optional[List[str]] = None
    seq: Optional[int] = None
    finished: bool = False
    finish_reason: Optional[str] = None
    timeout: bool = False
    draw_offer_cleared: bool = False


def _acquire_lock(r, key: str) -> Optional[str]:
    token = uuid.uuid4().hex
    try:
        if r.set(key, token, nx=True, ex=LOCK_TTL_SECONDS):
            return token
    except Exception:
        pass
    return None


def _release_lock(r, key: str, token: str) -> None:
    try:
        r.eval(_RELEASE_LOCK_LUA, 1, key, token)
    except Exception:
        pass


def build_board_from_moves(moves_raw: Optional[str], start_fen: Optional[str] = None) -> Optional[chess.Board]:
    try:
        board = chess.Board(start_fen or chess.STARTING_FEN)
    except Exception:
        board = chess.Board()
    if not moves_raw:
        return board
    moves = [move.strip() for move in moves_raw.split() if move.strip()]
    for move_san in moves:
        try:
            move = board.parse_san(move_san)
        except Exception:
            try:
                move = board.parse_uci(move_san)
            except Exception:
                return None
        board.push(move)
    return board


def is_insufficient_material(board: chess.Board) -> bool:
    if not board:
        return False
    counts = {
        chess.WHITE: {"p": 0, "n": 0, "b": 0, "r": 0, "q": 0},
        chess.BLACK: {"p": 0, "n": 0, "b": 0, "r": 0, "q": 0},
    }
    for piece in board.piece_map().values():
        symbol = piece.symbol().lower()
        if symbol in counts[piece.color]:
            counts[piece.color][symbol] += 1
    for color in (chess.WHITE, chess.BLACK):
        if counts[color]["p"] or counts[color]["r"] or counts[color]["q"]:
            return False
    allowed = {(0, 0), (1, 0), (0, 1), (0, 2)}
    white_minors = (counts[chess.WHITE]["b"], counts[chess.WHITE]["n"])
    black_minors = (counts[chess.BLACK]["b"], counts[chess.BLACK]["n"])
    return white_minors in allowed and black_minors in allowed


def _evaluate_result(
    board: chess.Board,
    moves_raw: Optional[str] = None,
    start_fen: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    if board.is_checkmate():
        winner_is_white = board.turn is chess.BLACK
        return (Game.RESULT_WHITE if winner_is_white else Game.RESULT_BLACK), "checkmate"
    if board.is_stalemate():
        return Game.RESULT_DRAW, "stalemate"
    if is_insufficient_material(board):
        return Game.RESULT_DRAW, "insufficient_material"
    history_board = board
    if moves_raw:
        history_board = build_board_from_moves(moves_raw, start_fen) or board
    if history_board.is_fivefold_repetition():
        return Game.RESULT_DRAW, "fivefold_repetition"
    if history_board.is_seventyfive_moves():
        return Game.RESULT_DRAW, "seventyfive_moves"
    if history_board.is_repetition(3):
        return Game.RESULT_DRAW, "threefold_repetition"
    if history_board.halfmove_clock >= 100:
        return Game.RESULT_DRAW, "fifty_moves"
    return None, None


def compute_clock_snapshot(game: Game, now=None, board: Optional[chess.Board] = None) -> Dict[str, Any]:
    if now is None:
        now = timezone.now()
    if board is None:
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            board = chess.Board()
    white_left = game.white_time_left
    black_left = game.black_time_left
    elapsed = 0
    move_count = len((game.moves or "").strip().split()) if game.moves else 0
    # Do not run the main clock until both players have made their first move.
    if game.status == Game.STATUS_ACTIVE and game.last_move_at and move_count >= 2:
        elapsed = int((now - game.last_move_at).total_seconds())
        if elapsed < 0:
            elapsed = 0
        if board.turn is chess.WHITE:
            white_left = max(0, white_left - elapsed)
        else:
            black_left = max(0, black_left - elapsed)
    return {
        "white_time_left": white_left,
        "black_time_left": black_left,
        "last_move_at": int(game.last_move_at.timestamp()) if game.last_move_at else None,
        "turn": "white" if board.turn is chess.WHITE else "black",
        "server_time": int(now.timestamp()),
        "elapsed": elapsed,
        "move_count": move_count,
    }


def _update_redis_clock(r, game: Game, board: chess.Board, now) -> None:
    try:
        r.hset(
            f"game:clock:{game.id}",
            mapping={
                "white_time_left": game.white_time_left,
                "black_time_left": game.black_time_left,
                "last_move_at": int(game.last_move_at.timestamp()) if game.last_move_at else int(now.timestamp()),
                "turn": "white" if board.turn is chess.WHITE else "black",
            },
        )
    except Exception:
        pass


def _append_event(r, game: Game, now, payload: Dict[str, Any]) -> Optional[int]:
    if not r:
        return None
    try:
        seq = int(r.incr(f"game:seq:{game.id}"))
        event = {"seq": str(seq), "ts": str(int(now.timestamp()))}
        for key, value in payload.items():
            if value is None:
                continue
            event[key] = str(value)
        r.xadd(
            f"game:events:{game.id}",
            event,
            maxlen=EVENT_STREAM_MAXLEN,
            approximate=True,
        )
        return seq
    except Exception:
        return None


def append_game_event(game: Game, payload: Dict[str, Any], now=None) -> Optional[int]:
    """Append a non-move event to the game's Redis event stream."""
    try:
        r = get_redis()
    except Exception:
        r = None
    if not r:
        return None
    timestamp = now or timezone.now()
    return _append_event(r, game, timestamp, payload)


def _build_state(
    game: Game,
    board: chess.Board,
    now,
    san: Optional[str],
    uci: Optional[str],
    seq: Optional[int],
) -> Dict[str, Any]:
    move_count = len((game.moves or "").strip().split()) if game.moves else 0
    first_move_deadline = None
    first_move_color = None
    if move_count == 0 and game.status == Game.STATUS_ACTIVE and game.started_at:
        first_move_deadline = int((game.started_at + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)).timestamp())
        first_move_color = "white"
    elif move_count == 1 and game.status == Game.STATUS_ACTIVE and game.started_at:
        anchor = game.last_move_at or game.started_at
        first_move_deadline = int((anchor + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)).timestamp())
        first_move_color = "black"

    return {
        "seq": seq,
        "ts": int(now.timestamp()),
        "game_id": game.id,
        "san": san,
        "uci": uci,
        "fen": game.current_fen,
        "moves": game.moves,
        "white_time_left": game.white_time_left,
        "black_time_left": game.black_time_left,
        "last_move_at": int(game.last_move_at.timestamp()) if game.last_move_at else None,
        "turn": "white" if board.turn is chess.WHITE else "black",
        "status": game.status,
        "result": game.result,
        "draw_offer_by": game.draw_offer_by.id if game.draw_offer_by else None,
        "server_time": int(now.timestamp()),
        "created_at": game.created_at.isoformat() if game.created_at else None,
        "started_at": game.started_at.isoformat() if game.started_at else None,
        "move_count": move_count,
        "first_move_deadline": first_move_deadline,
        "first_move_color": first_move_color,
    }


def apply_move(game_id: int, player, move_str: str, now=None) -> MoveResult:
    r = None
    try:
        r = get_redis()
    except Exception:
        r = None

    lock_token = None
    if r:
        lock_token = _acquire_lock(r, f"game:lock:{game_id}")
        if not lock_token:
            return MoveResult(ok=False, error="Game is busy. Please retry.")

    try:
        with transaction.atomic():
            try:
                game = (
                    Game.objects.select_for_update()
                    .select_related("white", "black")
                    .get(id=game_id)
                )
            except Game.DoesNotExist:
                return MoveResult(ok=False, error="Game not found.")

            if player != game.white and player != game.black:
                return MoveResult(ok=False, error="You are not part of this game.")
            if game.status in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
                return MoveResult(ok=False, error="Game is not active.")

            try:
                board = chess.Board(game.current_fen or chess.STARTING_FEN)
            except Exception:
                board = chess.Board()

            current_player = game.white if board.turn is chess.WHITE else game.black
            if player != current_player:
                return MoveResult(ok=False, error="Not your turn.")

            if now is None:
                now = timezone.now()

            move_list = (game.moves or "").strip().split() if game.moves else []
            move_count = len(move_list)

            # Start game if pending
            if game.status == Game.STATUS_PENDING:
                game.status = Game.STATUS_ACTIVE
                game.started_at = now
                # Do not start the main clock until both players have moved once
                if move_count < 1:
                    game.last_move_at = None
                elif not game.last_move_at:
                    game.last_move_at = now

            # Apply elapsed time to side to move before move validation
            timeout_result = None
            if game.status == Game.STATUS_ACTIVE and game.last_move_at and move_count >= 2:
                elapsed = int((now - game.last_move_at).total_seconds())
                if elapsed < 0:
                    elapsed = 0
                if board.turn is chess.WHITE:
                    game.white_time_left = max(0, game.white_time_left - elapsed)
                    if game.white_time_left <= 0:
                        timeout_result = Game.RESULT_BLACK
                else:
                    game.black_time_left = max(0, game.black_time_left - elapsed)
                    if game.black_time_left <= 0:
                        timeout_result = Game.RESULT_WHITE

            if timeout_result:
                timeout_reason = "timeout"
                if is_insufficient_material(board):
                    timeout_result = Game.RESULT_DRAW
                    timeout_reason = "timeout_insufficient_material"
                game.status = Game.STATUS_FINISHED
                game.result = timeout_result
                game.finished_at = now
                game.save(
                    update_fields=[
                        "status",
                        "result",
                        "finished_at",
                        "white_time_left",
                        "black_time_left",
                        "last_move_at",
                    ]
                )
                if r:
                    _update_redis_clock(r, game, board, now)
                    seq = _append_event(
                        r,
                        game,
                        now,
                        {
                            "type": "timeout",
                            "result": timeout_result,
                            "turn": "white" if board.turn is chess.WHITE else "black",
                        },
                    )
                else:
                    seq = None
                state = _build_state(game, board, now, None, None, seq)
                return MoveResult(
                    ok=False,
                    error="Time expired.",
                    game=game,
                    state=state,
                    seq=seq,
                    finished=True,
                    finish_reason=timeout_reason,
                    timeout=True,
                )

            success, error_msg, move, extra = process_move_optimized(game, move_str, board)
            if not success or not move:
                return MoveResult(ok=False, error=error_msg or "Illegal move.")

            san = extra.get("san", move_str)
            uci = extra.get("uci", move.uci())
            move_list.append(san)
            game.moves = " ".join(move_list)
            game.current_fen = extra.get("fen", board.fen())
            draw_offer_cleared = False
            if game.draw_offer_by:
                game.draw_offer_by = None
                draw_offer_cleared = True

            if current_player == game.white:
                game.white_time_left += game.white_increment_seconds
            else:
                game.black_time_left += game.black_increment_seconds

            # Track first move time for the black grace period; main clock starts after both moves
            game.last_move_at = now
            result, reason = _evaluate_result(board, game.moves, game.START_FEN)
            finished = False
            if result:
                game.status = Game.STATUS_FINISHED
                game.result = result
                game.finished_at = now
                finished = True
            else:
                game.status = Game.STATUS_ACTIVE

            update_fields = [
                "status",
                "result",
                "current_fen",
                "moves",
                "white_time_left",
                "black_time_left",
                "last_move_at",
                "started_at",
                "finished_at",
            ]
            if draw_offer_cleared:
                update_fields.append("draw_offer_by")
            game.save(update_fields=update_fields)

            if r:
                _update_redis_clock(r, game, board, now)
                seq = _append_event(
                    r,
                    game,
                    now,
                    {
                        "type": "move",
                        "san": san,
                        "uci": uci,
                        "fen": game.current_fen,
                        "moves": game.moves,
                        "white_time_left": game.white_time_left,
                        "black_time_left": game.black_time_left,
                        "turn": "white" if board.turn is chess.WHITE else "black",
                        "status": game.status,
                        "result": game.result,
                        "reason": reason if finished else None,
                    },
                )
                if draw_offer_cleared:
                    _append_event(
                        r,
                        game,
                        now,
                        {
                            "type": "draw_response",
                            "game_id": game.id,
                            "decision": "auto_decline",
                        },
                    )
            else:
                seq = None

            legal_moves = []
            try:
                legal_moves = [board.san(m) for m in list(board.legal_moves)[:50]]
            except Exception:
                legal_moves = []

            state = _build_state(game, board, now, san, uci, seq)
            return MoveResult(
                ok=True,
                game=game,
                state=state,
                legal_moves=legal_moves,
                seq=seq,
                finished=finished,
                finish_reason=reason,
                draw_offer_cleared=draw_offer_cleared,
            )
    finally:
        if r and lock_token:
            _release_lock(r, f"game:lock:{game_id}", lock_token)
