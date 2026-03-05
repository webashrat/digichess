"""
Cheat detection engine combining:
- PGN-Spy T% Multi-PV analysis (https://github.com/MGleason1/PGN-Spy, MIT)
- Irwin statistical features (https://github.com/clarkerubber/irwin, AGPL-3.0)

Produces per-move and aggregate statistics used for both:
1. Immediate statistical verdicts (works from day one)
2. Tensor generation for the Irwin neural network (trains over time)
"""

import logging
import math
from typing import Optional

import chess
import chess.engine

from .models import Game
from .stockfish_utils import ensure_stockfish_works, get_stockfish_path

logger = logging.getLogger(__name__)

DEFAULT_BOOK_DEPTH = 10       # full moves to skip (PGN-Spy concept)
DEFAULT_MULTIPV = 5           # top-N engine lines for T1-T5
DEFAULT_DEPTH = 18
DEFAULT_TIME_PER_MOVE = 0.5
FORCED_MOVE_THRESHOLD = 200   # centipawns – gap for forced-move exclusion
UNDECIDED_THRESHOLD = 100     # centipawns – eval boundary for "undecided"
LOSING_THRESHOLD = 500        # centipawns – beyond this is "hopelessly lost"


def _cp_to_winning_chances(cp: int) -> float:
    """Lichess winning-chances formula (same as Irwin tensor feature)."""
    return 2.0 / (1.0 + math.exp(-0.00368208 * cp)) - 1.0


def _classify_move(cp_loss: float) -> str:
    if cp_loss <= 0:
        return "best"
    if cp_loss < 10:
        return "excellent"
    if cp_loss < 30:
        return "good"
    if cp_loss < 100:
        return "inaccuracy"
    if cp_loss < 300:
        return "mistake"
    return "blunder"


def _categorize_position(eval_cp: float, player_is_white: bool) -> str:
    """PGN-Spy position categorization from the player's perspective."""
    perspective = eval_cp if player_is_white else -eval_cp
    if abs(perspective) <= UNDECIDED_THRESHOLD:
        return "undecided"
    if perspective < -UNDECIDED_THRESHOLD:
        return "losing" if perspective > -LOSING_THRESHOLD else "losing"
    return "winning"


def _get_engine_path():
    path = get_stockfish_path()
    ok, msg, path = ensure_stockfish_works(path)
    if not ok:
        raise RuntimeError(f"Stockfish unavailable: {msg}")
    return path


def run_cheat_analysis(
    game: Game,
    target_user,
    book_depth: int = DEFAULT_BOOK_DEPTH,
    multipv: int = DEFAULT_MULTIPV,
    depth: int = DEFAULT_DEPTH,
    time_per_move: float = DEFAULT_TIME_PER_MOVE,
) -> dict:
    """
    Full cheat analysis on a single game for a target player.

    Returns a dict ready to populate CheatAnalysis fields.
    """
    moves_raw = (game.moves or "").strip()
    move_list = [m for m in moves_raw.split() if m] if moves_raw else []
    if not move_list:
        raise ValueError("Game has no moves to analyze.")

    player_is_white = game.white_id == target_user.id
    if not player_is_white and game.black_id != target_user.id:
        raise ValueError("Target user is not a player in this game.")

    player_color = chess.WHITE if player_is_white else chess.BLACK
    book_plies = book_depth * 2

    engine_path = _get_engine_path()

    move_times = game.move_times_ms if isinstance(game.move_times_ms, list) else []
    has_timing = len(move_times) > 0

    per_move = []
    tensor_moves = []
    tensor_piece_types = []
    player_move_times_ms = []

    prev_eval_cp = 0
    was_ever_losing = False

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        board = chess.Board()

        for ply_idx, move_san in enumerate(move_list):
            try:
                move = board.parse_san(move_san)
            except (chess.InvalidMoveError, chess.IllegalMoveError):
                board = chess.Board()
                for m_san in move_list[: ply_idx + 1]:
                    try:
                        board.push(board.parse_san(m_san))
                    except Exception:
                        break
                continue

            is_player_move = board.turn == player_color
            in_book = ply_idx < book_plies

            eval_before_cp = prev_eval_cp
            pos_category = _categorize_position(eval_before_cp, player_is_white)

            perspective_before = eval_before_cp if player_is_white else -eval_before_cp
            if perspective_before < -UNDECIDED_THRESHOLD:
                was_ever_losing = True

            if was_ever_losing and pos_category != "losing":
                effective_category = "post_losing"
            else:
                effective_category = pos_category

            move_is_capture = board.is_capture(move)
            board.push(move)

            if not is_player_move or in_book:
                info = engine.analyse(
                    board,
                    chess.engine.Limit(time=time_per_move * 0.3, depth=depth),
                )
                score = info.get("score")
                if score:
                    cp = score.pov(chess.WHITE).score(mate_score=100000)
                    if cp is not None:
                        prev_eval_cp = cp
                if is_player_move and in_book:
                    pass
                continue

            info_multi = engine.analyse(
                board,
                chess.engine.Limit(time=time_per_move, depth=depth),
                multipv=multipv,
            )

            if not isinstance(info_multi, list):
                info_multi = [info_multi]

            eval_after_cp = None
            best_eval_cp = None
            pv_moves = []

            for pv_idx, pv_info in enumerate(info_multi):
                score = pv_info.get("score")
                pv = pv_info.get("pv", [])
                if score:
                    cp = score.pov(chess.WHITE).score(mate_score=100000)
                    if pv_idx == 0:
                        eval_after_cp = cp
                        best_eval_cp = cp
                    if cp is not None and pv:
                        try:
                            pv_san = board.san(pv[0])
                        except Exception:
                            pv_san = str(pv[0])
                        pv_moves.append({"rank": pv_idx + 1, "move": pv_san, "eval_cp": cp})

            if eval_after_cp is None:
                eval_after_cp = prev_eval_cp

            cp_loss_raw = eval_before_cp - eval_after_cp if player_is_white else eval_after_cp - eval_before_cp
            cp_loss = max(0, cp_loss_raw)

            wc_before = _cp_to_winning_chances(
                eval_before_cp if player_is_white else -eval_before_cp
            )
            wc_after = _cp_to_winning_chances(
                eval_after_cp if player_is_white else -eval_after_cp
            )
            wcl = max(0.0, wc_before - wc_after)

            played_uci = move.uci()
            rank = None
            for pv_entry in pv_moves:
                try:
                    candidate = board.parse_san(pv_entry["move"])
                    if candidate.uci() == played_uci:
                        rank = pv_entry["rank"]
                        break
                except Exception:
                    continue

            is_forced = False
            if len(pv_moves) >= 2:
                gap = abs(pv_moves[0]["eval_cp"] - pv_moves[1]["eval_cp"])
                if gap >= FORCED_MOVE_THRESHOLD:
                    is_forced = True

            legal_count = board.legal_moves.count()
            is_capture = move_is_capture

            dest_rank = chess.square_rank(move.to_square)
            advancement = dest_rank if player_is_white else (7 - dest_rank)

            piece = board.piece_at(move.to_square)
            piece_type = piece.piece_type if piece else 0

            classification = _classify_move(cp_loss)

            is_suspicious = (
                rank == 1
                and effective_category == "undecided"
                and legal_count > 20
                and not is_forced
            )

            move_time_ms = move_times[ply_idx] if ply_idx < len(move_times) else 0
            player_move_times_ms.append(move_time_ms)
            move_time_cs = move_time_ms / 10.0

            per_move.append({
                "ply": ply_idx,
                "move_san": move_san,
                "cp_loss": round(cp_loss, 1),
                "wcl": round(wcl, 4),
                "rank": rank,
                "is_forced": is_forced,
                "position_category": effective_category,
                "classification": classification,
                "eval_before": eval_before_cp,
                "eval_after": eval_after_cp,
                "legal_moves": legal_count,
                "is_suspicious": is_suspicious,
                "move_time_ms": move_time_ms,
                "pv_moves": pv_moves[:3],
            })

            tensor_moves.append([
                round(wc_after, 4),
                round(wcl, 4),
                move_time_cs,
                0,
                0,
                advancement,
                legal_count,
                1 if is_capture else 0,
            ])
            tensor_piece_types.append([piece_type])

            prev_eval_cp = eval_after_cp

    avg_move_time_cs = 0.0
    if player_move_times_ms:
        avg_move_time_cs = sum(t / 10.0 for t in player_move_times_ms) / len(player_move_times_ms)

    for i, t_move in enumerate(tensor_moves):
        mt_cs = t_move[2]
        t_move[3] = round(mt_cs - avg_move_time_cs, 2)
        t_move[4] = round(100.0 * (mt_cs - avg_move_time_cs) / (avg_move_time_cs + 0.001), 2) if avg_move_time_cs > 0 else 0

    non_forced = [m for m in per_move if not m["is_forced"]]
    all_analyzed = per_move

    def _t_pct(moves_data, n):
        eligible = [m for m in moves_data if m["rank"] is not None or not m["is_forced"]]
        if not eligible:
            return 0.0
        count = sum(1 for m in eligible if m["rank"] is not None and m["rank"] <= n)
        return round(100.0 * count / len(eligible), 1)

    t1 = _t_pct(non_forced, 1)
    t2 = _t_pct(non_forced, 2)
    t3 = _t_pct(non_forced, 3)
    t4 = _t_pct(non_forced, 4)
    t5 = _t_pct(non_forced, 5)

    acpl = 0.0
    if all_analyzed:
        acpl = round(sum(m["cp_loss"] for m in all_analyzed) / len(all_analyzed), 1)

    avg_wcl = 0.0
    if all_analyzed:
        avg_wcl = round(sum(m["wcl"] for m in all_analyzed) / len(all_analyzed), 4)

    best_streak = 0
    current_streak = 0
    for m in all_analyzed:
        if m["rank"] == 1:
            current_streak += 1
            best_streak = max(best_streak, current_streak)
        else:
            current_streak = 0

    accuracy = max(0, min(100, 100 - acpl * 1.5)) if acpl < 66 else 0

    position_stats = {}
    for cat in ("undecided", "losing", "winning", "post_losing"):
        cat_moves = [m for m in non_forced if m["position_category"] == cat]
        if cat_moves:
            cat_acpl = round(sum(m["cp_loss"] for m in cat_moves) / len(cat_moves), 1)
            position_stats[cat] = {
                "count": len(cat_moves),
                "t1_pct": _t_pct(cat_moves, 1),
                "t2_pct": _t_pct(cat_moves, 2),
                "t3_pct": _t_pct(cat_moves, 3),
                "acpl": cat_acpl,
            }
        else:
            position_stats[cat] = {"count": 0, "t1_pct": 0, "t2_pct": 0, "t3_pct": 0, "acpl": 0}

    cp_dist = {">0": 0, ">10": 0, ">25": 0, ">50": 0, ">100": 0, ">200": 0}
    for m in all_analyzed:
        loss = m["cp_loss"]
        if loss > 0:
            cp_dist[">0"] += 1
        if loss > 10:
            cp_dist[">10"] += 1
        if loss > 25:
            cp_dist[">25"] += 1
        if loss > 50:
            cp_dist[">50"] += 1
        if loss > 100:
            cp_dist[">100"] += 1
        if loss > 200:
            cp_dist[">200"] += 1

    suspicious_moves = [m for m in all_analyzed if m["is_suspicious"]]

    forced_count = sum(1 for m in per_move if m["is_forced"])

    timing_stats = {}
    if player_move_times_ms and len(player_move_times_ms) >= 3:
        avg_ms = sum(player_move_times_ms) / len(player_move_times_ms)
        std_dev_ms = (sum((t - avg_ms) ** 2 for t in player_move_times_ms) / len(player_move_times_ms)) ** 0.5
        consistent_flag = std_dev_ms < 500 and len(player_move_times_ms) >= 20
        timing_stats = {
            "avg_move_time_ms": round(avg_ms),
            "std_dev_ms": round(std_dev_ms),
            "min_ms": min(player_move_times_ms),
            "max_ms": max(player_move_times_ms),
            "total_moves_timed": len(player_move_times_ms),
            "consistent_time_flag": consistent_flag,
        }

    player_rating = _get_player_rating(game, target_user, player_is_white)
    verdict, confidence = _compute_verdict(
        t1, acpl, avg_wcl, best_streak, position_stats, player_rating, len(all_analyzed)
    )

    pad_len = max(0, 60 - len(tensor_moves))
    padded_tensor = ([[0] * 8] * pad_len + tensor_moves)[:60]
    padded_pieces = ([[0]] * pad_len + tensor_piece_types)[:60]

    return {
        "t1_pct": t1,
        "t2_pct": t2,
        "t3_pct": t3,
        "t4_pct": t4,
        "t5_pct": t5,
        "avg_centipawn_loss": acpl,
        "avg_winning_chances_loss": avg_wcl,
        "best_move_streak": best_streak,
        "accuracy_score": round(accuracy, 1),
        "position_stats": position_stats,
        "move_classifications": per_move,
        "forced_moves_excluded": forced_count,
        "book_moves_excluded": min(book_plies, len(move_list)),
        "cp_loss_distribution": cp_dist,
        "suspicious_moves": [
            {"ply": m["ply"], "move_san": m["move_san"], "legal_moves": m["legal_moves"]}
            for m in suspicious_moves
        ],
        "verdict": verdict,
        "confidence": confidence,
        "total_moves_analyzed": len(all_analyzed),
        "timing_stats": timing_stats,
        "tensor_data": {
            "move_features": padded_tensor,
            "piece_types": padded_pieces,
        },
    }


def _get_player_rating(game: Game, user, is_white: bool) -> int:
    tc = game.time_control
    rating_field = {
        "bullet": "rating_bullet",
        "blitz": "rating_blitz",
        "rapid": "rating_rapid",
        "classical": "rating_classical",
    }.get(tc, "rating_blitz")
    return getattr(user, rating_field, 800)


def _compute_verdict(
    t1: float,
    acpl: float,
    avg_wcl: float,
    best_streak: int,
    position_stats: dict,
    rating: int,
    sample_size: int,
) -> tuple[str, float]:
    """
    Rating-aware verdict based on multiple signals.

    Thresholds scale linearly: what's normal for a 2400 is suspicious for a 1200.
    """
    normalized_rating = max(0.0, min(1.0, (rating - 800) / 1700.0))

    expected_t1 = 30 + normalized_rating * 25
    expected_acpl = 80 - normalized_rating * 55

    suspicion = 0.0

    if t1 > expected_t1 + 15:
        suspicion += min(0.3, (t1 - expected_t1 - 15) / 30)

    if acpl < expected_acpl - 15 and acpl < 20:
        suspicion += min(0.25, (expected_acpl - 15 - acpl) / 40)

    undecided = position_stats.get("undecided", {})
    undecided_t1 = undecided.get("t1_pct", 0)
    if undecided_t1 > expected_t1 + 20:
        suspicion += min(0.25, (undecided_t1 - expected_t1 - 20) / 25)

    if best_streak > 8 + int(normalized_rating * 6):
        suspicion += min(0.15, (best_streak - 8 - normalized_rating * 6) / 10)

    if avg_wcl < 0.01 and sample_size > 15:
        suspicion += 0.1

    confidence = min(1.0, sample_size / 25.0) * 0.8 + 0.2

    if suspicion >= 0.55:
        return "likely_cheating", round(min(1.0, suspicion) * confidence, 2)
    if suspicion >= 0.3:
        return "suspicious", round(min(1.0, suspicion) * confidence, 2)
    return "clean", round((1.0 - suspicion) * confidence, 2)
