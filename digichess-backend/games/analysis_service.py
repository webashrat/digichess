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


def analyze_game_with_stockfish(
    game: Game,
    engine_path: str,
    time_per_move: float = 0.3,
    depth: int = 15
) -> dict:
    """Analyze game with local Stockfish."""
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
                        }
                    ],
                    "summary": {"total_moves": 0, "analyzed_moves": 1},
                    "note": "Game has no moves, analyzed starting position",
                }
        except Exception as e:
            raise Exception(f"Failed to analyze starting position: {str(e)}")

    analysis_moves = []
    errors = []

    try:
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            # Always replay from the starting position to avoid double-applying moves.
            temp_board = chess.Board()

            for i, move_san in enumerate(moves):
                try:
                    move = temp_board.parse_san(move_san)
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
                    if score:
                        cp_score = score.pov(chess.WHITE).score(mate_score=100000)
                        if cp_score is not None:
                            eval_score = cp_score / 100.0
                        mate = score.pov(chess.WHITE).mate()

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
                        }
                    )
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
    result = {
        "moves": analysis_moves,
        "summary": {
            "total_moves": len(moves),
            "analyzed_moves": analyzed_count,
            "raw_moves_count": len(moves_raw.split()) if moves_raw else 0,
            "moves_sample": moves[:5] if moves else [],
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
