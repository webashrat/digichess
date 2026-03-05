import logging
from typing import Optional, Tuple

import chess
import chess.engine

from .lichess_api import get_cloud_evaluation
from .stockfish_utils import ensure_stockfish_works, get_stockfish_path
from .models import Game

logger = logging.getLogger(__name__)


def _get_moves(game: Game) -> Tuple[str, list[str]]:
    moves_raw = game.moves.strip() if game.moves else ""
    moves = [m.strip() for m in moves_raw.split() if m.strip()] if moves_raw else []
    return moves_raw, moves


def _build_final_board(game: Game, moves: Optional[list[str]] = None) -> chess.Board:
    if game.current_fen:
        try:
            return chess.Board(game.current_fen)
        except Exception:
            pass

    if moves is None:
        _, moves = _get_moves(game)

    board = chess.Board()
    for move_san in moves:
        try:
            move = board.parse_san(move_san)
            board.push(move)
        except Exception:
            continue
    return board


def _material_eval(board: chess.Board) -> float:
    values = {
        chess.PAWN: 1.0,
        chess.KNIGHT: 3.0,
        chess.BISHOP: 3.0,
        chess.ROOK: 5.0,
        chess.QUEEN: 9.0,
    }
    score = 0.0
    for piece_type, value in values.items():
        score += len(board.pieces(piece_type, chess.WHITE)) * value
        score -= len(board.pieces(piece_type, chess.BLACK)) * value
    return score


PIECE_VALUES = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0,
}


def classify_move(cp_loss: float, is_brilliant: bool = False) -> str:
    """Classify a move based on centipawn loss. Shared by analysis and cheat detection."""
    if is_brilliant:
        return "brilliant"
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


def _detect_brilliant(board_before: chess.Board, move: chess.Move, cp_loss: float) -> bool:
    """Chess.com-style brilliant: top engine move + material sacrifice + complex position."""
    if cp_loss > 0:
        return False
    if board_before.legal_moves.count() <= 15:
        return False

    piece = board_before.piece_at(move.from_square)
    if not piece:
        return False
    moved_value = PIECE_VALUES.get(piece.piece_type, 0)
    if moved_value < 3:
        return False

    captured = board_before.piece_at(move.to_square)
    captured_value = PIECE_VALUES.get(captured.piece_type, 0) if captured else 0

    board_after = board_before.copy()
    board_after.push(move)
    attackers = board_after.attackers(not piece.color, move.to_square)
    is_hanging = len(attackers) > 0

    return is_hanging and moved_value > captured_value


def analyze_game_with_stockfish(
    game: Game,
    engine_path: str,
    time_per_move: float = 0.3,
    depth: int = 15
) -> dict:
    """Analyze game with local Stockfish. Includes cp_loss, classification, and per-player stats."""
    moves_raw, moves = _get_moves(game)

    if not moves:
        board = chess.Board(game.current_fen or chess.STARTING_FEN)
        try:
            with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                limit = chess.engine.Limit(time=max(0.2, time_per_move), depth=depth)
                result = engine.analyse(board, limit)
                score = result.get("score")
                pv = result.get("pv", [])

                eval_score = None
                mate = None
                if score:
                    cp_score = score.pov(chess.WHITE).score(mate_score=100000)
                    if cp_score is not None:
                        eval_score = cp_score / 100.0
                    mate = score.pov(chess.WHITE).mate()

                return {
                    "moves": [
                        {
                            "move": None,
                            "move_number": 0,
                            "eval": eval_score,
                            "mate": mate,
                            "best_move": board.san(pv[0]) if pv else None,
                            "depth": result.get("depth", 0),
                            "cp_loss": 0,
                            "classification": "best",
                        }
                    ],
                    "summary": {"total_moves": 0, "analyzed_moves": 1},
                    "note": "Game has no moves, analyzed starting position",
                }
        except Exception as e:
            raise Exception(f"Failed to analyze starting position: {str(e)}")

    analysis_moves = []
    errors = []
    prev_eval_cp = 0

    try:
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            temp_board = chess.Board()

            for i, move_san in enumerate(moves):
                try:
                    move = temp_board.parse_san(move_san)
                    is_white_move = temp_board.turn == chess.WHITE
                    board_before = temp_board.copy()

                    temp_board.push(move)

                    limit = chess.engine.Limit(time=time_per_move, depth=depth)
                    result = engine.analyse(temp_board, limit)

                    if not result:
                        errors.append(f"Move {i+1} ({move_san}): No result from engine")
                        continue

                    score = result.get("score")
                    pv = result.get("pv", [])

                    eval_score = None
                    mate = None
                    current_eval_cp = prev_eval_cp
                    if score:
                        cp_score = score.pov(chess.WHITE).score(mate_score=100000)
                        if cp_score is not None:
                            eval_score = cp_score / 100.0
                            current_eval_cp = cp_score
                        mate = score.pov(chess.WHITE).mate()

                    if is_white_move:
                        cp_loss_raw = prev_eval_cp - current_eval_cp
                    else:
                        cp_loss_raw = current_eval_cp - prev_eval_cp
                    cp_loss = max(0, cp_loss_raw)

                    brilliant = _detect_brilliant(board_before, move, cp_loss)
                    classification = classify_move(cp_loss, is_brilliant=brilliant)

                    best_move_san = None
                    if pv and len(pv) > 0:
                        try:
                            best_move_san = temp_board.san(pv[0])
                        except Exception:
                            best_move_san = str(pv[0])

                    analysis_moves.append(
                        {
                            "move": move_san,
                            "move_number": i + 1,
                            "eval": eval_score,
                            "mate": mate,
                            "best_move": best_move_san,
                            "depth": result.get("depth", 0),
                            "cp_loss": round(cp_loss / 100.0, 2),
                            "classification": classification,
                        }
                    )

                    prev_eval_cp = current_eval_cp

                except chess.InvalidMoveError as e:
                    errors.append(f"Move {i+1} ({move_san}): Invalid move - {str(e)}")
                    continue
                except Exception as e:
                    errors.append(f"Move {i+1} ({move_san}): Error - {str(e)}")
                    continue

    except OSError as e:
        if e.errno == 8:
            raise Exception("Stockfish architecture mismatch detected. Please check server logs.")
        raise Exception(f"Failed to start Stockfish engine: {str(e)}")
    except Exception as e:
        raise Exception(f"Failed to start Stockfish engine: {str(e)}")

    analyzed_count = len([m for m in analysis_moves if m.get("eval") is not None])

    def _player_stats(side_moves):
        if not side_moves:
            return {"acpl": 0, "accuracy": 0, "brilliant": 0, "best": 0, "excellent": 0, "good": 0, "inaccuracy": 0, "mistake": 0, "blunder": 0}
        total_cp = sum(m.get("cp_loss", 0) for m in side_moves) * 100
        acpl = round(total_cp / len(side_moves), 1) if side_moves else 0
        accuracy = round(max(0, min(100, 100 - acpl * 1.5)), 1) if acpl < 66 else 0
        counts = {"brilliant": 0, "best": 0, "excellent": 0, "good": 0, "inaccuracy": 0, "mistake": 0, "blunder": 0}
        for m in side_moves:
            c = m.get("classification", "")
            if c in counts:
                counts[c] += 1
        return {"acpl": acpl, "accuracy": accuracy, **counts}

    white_moves = [m for m in analysis_moves if m["move_number"] % 2 == 1]
    black_moves = [m for m in analysis_moves if m["move_number"] % 2 == 0]

    result = {
        "moves": analysis_moves,
        "summary": {
            "total_moves": len(moves),
            "analyzed_moves": analyzed_count,
            "raw_moves_count": len(moves_raw.split()) if moves_raw else 0,
            "moves_sample": moves[:5] if moves else [],
            "white": _player_stats(white_moves),
            "black": _player_stats(black_moves),
        },
    }

    if errors:
        result["errors"] = errors[:10]

    if analyzed_count == 0 and len(moves) > 0:
        result["warning"] = f"Found {len(moves)} moves but none were successfully analyzed. Check errors."

    return result


def analyze_game_with_lichess(game: Game, depth: int = 18, max_moves: int | None = None) -> dict:
    """Analyze game using Lichess Cloud Evaluation API."""
    _, moves = _get_moves(game)

    analysis_moves = []
    errors = []
    board = chess.Board()

    start_index = 0
    moves_to_analyze = moves
    if max_moves and len(moves) > max_moves:
        start_index = len(moves) - max_moves
        moves_to_analyze = moves[start_index:]
        for move_san in moves[:start_index]:
            try:
                move = board.parse_san(move_san)
                board.push(move)
            except Exception:
                continue

    for i, move_san in enumerate(moves_to_analyze):
        try:
            move = board.parse_san(move_san)
            board.push(move)

            eval_data = get_cloud_evaluation(board.fen(), depth=depth, multi_pv=1)

            if eval_data and eval_data.get("pvs"):
                pv_data = eval_data["pvs"][0]
                cp = pv_data.get("cp")
                mate = pv_data.get("mate")
                best_moves = pv_data.get("moves", "").split()
                best_move_san = None

                if best_moves:
                    try:
                        temp_board = board.copy()
                        best_move_uci = best_moves[0]
                        best_move_obj = chess.Move.from_uci(best_move_uci)
                        if best_move_obj in temp_board.legal_moves:
                            best_move_san = temp_board.san(best_move_obj)
                    except Exception:
                        best_move_san = best_moves[0] if best_moves else None

                eval_score = cp / 100.0 if cp is not None else None

                analysis_moves.append(
                    {
                        "move": move_san,
                        "move_number": start_index + i + 1,
                        "eval": eval_score,
                        "mate": mate,
                        "best_move": best_move_san,
                        "depth": eval_data.get("depth", 0),
                        "knodes": eval_data.get("knodes", 0),
                    }
                )
            else:
                errors.append(f"Move {start_index + i + 1} ({move_san}): Lichess API returned no evaluation")

        except chess.InvalidMoveError as e:
            errors.append(f"Move {start_index + i + 1} ({move_san}): Invalid move - {str(e)}")
            continue
        except Exception as e:
            errors.append(f"Move {start_index + i + 1} ({move_san}): Error - {str(e)}")
            continue

    analyzed_count = len([m for m in analysis_moves if m.get("eval") is not None])

    result = {
        "moves": analysis_moves,
        "summary": {
            "total_moves": len(moves),
            "analyzed_moves": analyzed_count,
            "errors": errors[:10] if errors else [],
            "source": "lichess_cloud",
        },
    }

    if start_index > 0:
        result["summary"]["partial"] = True
        result["summary"]["start_move"] = start_index + 1

    if analyzed_count == 0 and len(moves) > 0:
        result["warning"] = f"Found {len(moves)} moves but none were successfully analyzed. Check errors."

    return result


def run_full_analysis(
    game: Game,
    prefer_lichess: bool = True,
    time_per_move: float = 0.3,
    depth: int = 15,
    max_moves: int | None = None,
    allow_lichess_fallback: bool = True,
) -> Tuple[dict, str, Optional[str]]:
    """Run full analysis with Lichess first, fallback to local Stockfish."""
    analysis_data = None
    source = None
    engine_path = None

    if prefer_lichess:
        try:
            analysis_data = analyze_game_with_lichess(game, depth=depth, max_moves=max_moves)
            if analysis_data and analysis_data.get("summary", {}).get("analyzed_moves", 0) > 0:
                source = "lichess"
            else:
                analysis_data = None
        except Exception as exc:
            logger.warning(f"Lichess analysis failed, falling back to local Stockfish: {exc}")
            analysis_data = None

    if not analysis_data:
        engine_path = get_stockfish_path()
        works, message, engine_path = ensure_stockfish_works(engine_path)
        if not works:
            if allow_lichess_fallback and not prefer_lichess:
                analysis_data = analyze_game_with_lichess(game, depth=depth, max_moves=max_moves)
                source = "lichess"
            else:
                raise Exception(f"Local Stockfish unavailable: {message}")
        else:
            analysis_data = analyze_game_with_stockfish(
                game,
                engine_path,
                time_per_move=time_per_move,
                depth=depth,
            )
            source = "local_stockfish"

    return analysis_data, source or "unknown", engine_path


def run_quick_eval(game: Game, prefer_lichess: bool = True) -> dict:
    """Run a fast single-position evaluation for immediate UI feedback."""
    moves_raw, moves = _get_moves(game)
    board = _build_final_board(game, moves)
    fen = board.fen()
    move_number = len(moves)

    if prefer_lichess:
        try:
            eval_data = get_cloud_evaluation(fen, depth=14, multi_pv=1)
            if eval_data and eval_data.get("pvs"):
                pv_data = eval_data["pvs"][0]
                cp = pv_data.get("cp")
                mate = pv_data.get("mate")
                best_moves = pv_data.get("moves", "").split()
                best_move_san = None
                if best_moves:
                    try:
                        best_move_obj = chess.Move.from_uci(best_moves[0])
                        if best_move_obj in board.legal_moves:
                            best_move_san = board.san(best_move_obj)
                        else:
                            best_move_san = best_moves[0]
                    except Exception:
                        best_move_san = best_moves[0]

                return {
                    "fen": fen,
                    "move_number": move_number,
                    "eval": cp / 100.0 if cp is not None else None,
                    "mate": mate,
                    "best_move": best_move_san,
                    "depth": eval_data.get("depth", 0),
                    "knodes": eval_data.get("knodes", 0),
                    "source": "lichess",
                }
        except Exception as exc:
            logger.warning(f"Quick eval via Lichess failed: {exc}")

    engine_path = get_stockfish_path()
    works, message, engine_path = ensure_stockfish_works(engine_path)
    if not works:
        # Lightweight fallback: material-only evaluation.
        return {
            "fen": fen,
            "move_number": move_number,
            "eval": _material_eval(board),
            "mate": None,
            "best_move": None,
            "depth": 0,
            "source": "material",
            "note": f"Stockfish unavailable ({message})",
        }

    try:
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            limit = chess.engine.Limit(time=0.12, depth=12)
            result = engine.analyse(board, limit)
            score = result.get("score")
            pv = result.get("pv", [])
            eval_score = None
            mate = None
            if score:
                cp_score = score.pov(chess.WHITE).score(mate_score=100000)
                if cp_score is not None:
                    eval_score = cp_score / 100.0
                mate = score.pov(chess.WHITE).mate()

            return {
                "fen": fen,
                "move_number": move_number,
                "eval": eval_score,
                "mate": mate,
                "best_move": board.san(pv[0]) if pv else None,
                "depth": result.get("depth", 0),
                "source": "local_stockfish",
            }
    except Exception as exc:
        return {
            "fen": fen,
            "move_number": move_number,
            "error": str(exc),
            "source": "local_stockfish",
        }
