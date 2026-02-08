import chess
import chess.engine
import chess.pgn
from io import StringIO
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
import logging

from .models import Game, GameAnalysis
from .serializers import GameSerializer
from .stockfish_utils import ensure_stockfish_works, get_stockfish_path
from .lichess_api import analyze_position_with_lichess, get_cloud_evaluation, get_opening_explorer, get_tablebase
from .analysis_service import run_full_analysis

logger = logging.getLogger(__name__)


def _parse_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _format_dt(value):
    return value.isoformat() if value else None


def _serialize_analysis_record(record: GameAnalysis, include_analysis: bool = True) -> dict:
    return {
        "game_id": record.game_id,
        "status": record.status,
        "source": record.source or None,
        "analysis": record.analysis if include_analysis else None,
        "quick_eval": record.quick_eval,
        "error": record.error or None,
        "requested_at": _format_dt(record.requested_at),
        "started_at": _format_dt(record.started_at),
        "completed_at": _format_dt(record.completed_at),
    }


def _analysis_is_complete(analysis: dict | None) -> bool:
    if not analysis:
        return False
    summary = analysis.get("summary") or {}
    if summary.get("partial"):
        return False
    total_moves = summary.get("total_moves")
    moves = analysis.get("moves") or []
    if total_moves is None:
        return True
    return total_moves == 0 or len(moves) >= total_moves


class GameFullAnalysisView(APIView):
    """Full game analysis with Stockfish or Lichess API"""
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk: int):
        """Request full game analysis"""
        game = get_object_or_404(Game, id=pk)
        
        # Check if game is finished
        if game.status != Game.STATUS_FINISHED:
            return Response(
                {"detail": "Analysis is only available for finished games."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        force = _parse_bool(request.data.get("force"), default=False)

        analysis_record, created = GameAnalysis.objects.get_or_create(
            game=game,
            defaults={"status": GameAnalysis.STATUS_QUEUED},
        )

        if (
            analysis_record.status == GameAnalysis.STATUS_COMPLETED
            and analysis_record.analysis
            and _analysis_is_complete(analysis_record.analysis)
        ):
            return Response(_serialize_analysis_record(analysis_record))

        now = timezone.now()
        analysis_record.status = GameAnalysis.STATUS_RUNNING
        analysis_record.requested_at = now
        analysis_record.started_at = now
        analysis_record.completed_at = None
        analysis_record.error = ""
        analysis_record.source = ""
        analysis_record.analysis = None
        analysis_record.quick_eval = None
        analysis_record.save(
            update_fields=[
                "status",
                "requested_at",
                "started_at",
                "completed_at",
                "error",
                "source",
                "analysis",
                "quick_eval",
                "updated_at",
            ]
        )

        try:
            analysis_data, source, _engine_path = run_full_analysis(
                game,
                prefer_lichess=False,
                time_per_move=0.1,
                depth=12,
                max_moves=None,
                allow_lichess_fallback=False,
            )
            if not _analysis_is_complete(analysis_data):
                raise Exception("Analysis incomplete: not all moves were analyzed.")
            analysis_record.analysis = analysis_data
            analysis_record.source = source
            analysis_record.status = GameAnalysis.STATUS_COMPLETED
            analysis_record.completed_at = timezone.now()
            analysis_record.error = ""
            analysis_record.save(
                update_fields=[
                    "analysis",
                    "source",
                    "status",
                    "completed_at",
                    "error",
                    "updated_at",
                ]
            )
            return Response(_serialize_analysis_record(analysis_record))
        except Exception as exc:
            analysis_record.status = GameAnalysis.STATUS_FAILED
            analysis_record.error = str(exc)
            analysis_record.completed_at = timezone.now()
            analysis_record.save(update_fields=["status", "error", "completed_at", "updated_at"])
            return Response(_serialize_analysis_record(analysis_record), status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def _analyze_with_stockfish(self, game: Game, engine_path: str):
        """Analyze game with local Stockfish"""
        # Get moves - filter out empty strings
        moves_raw = game.moves.strip() if game.moves else ""
        moves = [m.strip() for m in moves_raw.split() if m.strip()] if moves_raw else []
        
        if not moves:
            # If no moves, analyze the starting position
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
            try:
                with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                    limit = chess.engine.Limit(time=0.5, depth=15)
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
                        "moves": [{
                            "move": None,
                            "move_number": 0,
                            "eval": eval_score,
                            "mate": mate,
                            "best_move": board.san(pv[0]) if pv else None,
                            "depth": result.get("depth", 0)
                        }],
                        "summary": {
                            "total_moves": 0,
                            "analyzed_moves": 1
                        },
                        "note": "Game has no moves, analyzed starting position"
                    }
            except Exception as e:
                raise Exception(f"Failed to analyze starting position: {str(e)}")
        
        analysis_moves = []
        errors = []
        
        try:
            with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                # Analyze each position from the standard starting position.
                temp_board = chess.Board()
                
                for i, move_san in enumerate(moves):
                    try:
                        move = temp_board.parse_san(move_san)
                        temp_board.push(move)
                        
                        # Analyze position after this move
                        limit = chess.engine.Limit(time=0.3, depth=15)
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
                                eval_score = cp_score / 100.0  # Convert to pawns
                            mate = score.pov(chess.WHITE).mate()
                        
                        best_move_san = None
                        if pv and len(pv) > 0:
                            try:
                                best_move_san = temp_board.san(pv[0])
                            except Exception:
                                best_move_san = str(pv[0])
                        
                        analysis_moves.append({
                            "move": move_san,
                            "move_number": i + 1,
                            "eval": eval_score,
                            "mate": mate,
                            "best_move": best_move_san,
                            "depth": result.get("depth", 0)
                        })
                    except chess.InvalidMoveError as e:
                        errors.append(f"Move {i+1} ({move_san}): Invalid move - {str(e)}")
                        continue
                    except Exception as e:
                        errors.append(f"Move {i+1} ({move_san}): Error - {str(e)}")
                        continue
        
        except OSError as e:
            if e.errno == 8:  # Exec format error
                # This shouldn't happen if ensure_stockfish_works was called, but handle it anyway
                raise Exception(
                    f"Stockfish architecture mismatch detected. "
                    f"This should have been auto-fixed. Please check server logs."
                )
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
                "moves_sample": moves[:5] if moves else []  # First 5 moves for debugging
            }
        }
        
        if errors:
            result["errors"] = errors[:10]  # Limit to first 10 errors
        
        # Add warning if no moves were analyzed
        if analyzed_count == 0 and len(moves) > 0:
            result["warning"] = f"Found {len(moves)} moves but none were successfully analyzed. Check errors."
        
        return result

    def _analyze_with_lichess(self, game: Game):
        """Analyze game using Lichess Cloud Evaluation API - fast and free!"""
        moves = game.moves.split() if game.moves else []
        if not moves:
            # Analyze starting position
            fen = chess.STARTING_FEN
        else:
            # Replay game to get final position
            board = chess.Board()
            for move_san in moves:
                try:
                    move = board.parse_san(move_san)
                    board.push(move)
                except Exception:
                    continue
            fen = board.fen()
        
        analysis_moves = []
        errors = []
        
        # Analyze each position after each move using Lichess API
        board = chess.Board()
        
        for i, move_san in enumerate(moves):
            try:
                move = board.parse_san(move_san)
                board.push(move)
                
                # Get evaluation from Lichess cloud
                eval_data = get_cloud_evaluation(board.fen(), depth=18, multi_pv=1)
                
                if eval_data and eval_data.get("pvs"):
                    pv_data = eval_data["pvs"][0]
                    cp = pv_data.get("cp")
                    mate = pv_data.get("mate")
                    best_moves = pv_data.get("moves", "").split()
                    best_move_san = None
                    
                    if best_moves:
                        try:
                            # Convert UCI to SAN for best move
                            temp_board = board.copy()
                            best_move_uci = best_moves[0]
                            best_move_obj = chess.Move.from_uci(best_move_uci)
                            if best_move_obj in temp_board.legal_moves:
                                best_move_san = temp_board.san(best_move_obj)
                        except Exception:
                            best_move_san = best_moves[0] if best_moves else None
                    
                    eval_score = cp / 100.0 if cp is not None else None  # Convert centipawns to pawns
                    
                    analysis_moves.append({
                        "move": move_san,
                        "move_number": i + 1,
                        "eval": eval_score,
                        "mate": mate,
                        "best_move": best_move_san,
                        "depth": eval_data.get("depth", 0),
                        "knodes": eval_data.get("knodes", 0)
                    })
                else:
                    errors.append(f"Move {i+1} ({move_san}): Lichess API returned no evaluation")
                    
            except chess.InvalidMoveError as e:
                errors.append(f"Move {i+1} ({move_san}): Invalid move - {str(e)}")
                continue
            except Exception as e:
                errors.append(f"Move {i+1} ({move_san}): Error - {str(e)}")
                continue
        
        analyzed_count = len([m for m in analysis_moves if m.get("eval") is not None])
        
        result = {
            "moves": analysis_moves,
            "summary": {
                "total_moves": len(moves),
                "analyzed_moves": analyzed_count,
                "errors": errors[:10] if errors else [],  # Limit errors
                "source": "lichess_cloud"
            }
        }
        
        if analyzed_count == 0 and len(moves) > 0:
            result["warning"] = f"Found {len(moves)} moves but none were successfully analyzed. Check errors."
        
        return result


class OpeningExplorerView(APIView):
    """Get opening explorer data from Lichess for a position"""
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        """Get opening explorer data"""
        fen = request.data.get("fen", chess.STARTING_FEN)
        variant = request.data.get("variant", "standard")
        speeds = request.data.get("speeds", None)
        ratings = request.data.get("ratings", None)
        
        explorer_data = get_opening_explorer(fen, variant=variant, speeds=speeds, ratings=ratings)
        
        if explorer_data:
            return Response({
                "fen": fen,
                "opening_explorer": explorer_data,
                "source": "lichess"
            })
        else:
            return Response(
                {"detail": "Failed to get opening explorer data from Lichess API"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class TablebaseView(APIView):
    """Get tablebase (endgame database) information from Lichess"""
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        """Get tablebase data"""
        fen = request.data.get("fen")
        variant = request.data.get("variant", "standard")
        
        if not fen:
            return Response(
                {"detail": "fen is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tablebase_data = get_tablebase(fen, variant=variant)
        
        if tablebase_data:
            return Response({
                "fen": fen,
                "tablebase": tablebase_data,
                "source": "lichess"
            })
        else:
            return Response(
                {"detail": "Failed to get tablebase data from Lichess API or position has too many pieces"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class GameAnalysisRequestView(APIView):
    """Request analysis for a finished game"""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        """Get analysis status"""
        game = get_object_or_404(Game, id=pk)

        analysis_record = GameAnalysis.objects.filter(game=game).first()
        if not analysis_record:
            return Response(
                {
                    "game_id": game.id,
                    "status": "not_requested",
                    "can_analyze": game.status == Game.STATUS_FINISHED,
                    "analysis": None,
                    "quick_eval": None,
                    "error": None,
                }
            )

        if (
            analysis_record.status == GameAnalysis.STATUS_COMPLETED
            and analysis_record.analysis
            and not _analysis_is_complete(analysis_record.analysis)
        ):
            analysis_record.status = GameAnalysis.STATUS_FAILED
            analysis_record.error = "Analysis incomplete. Please run analysis again."
            analysis_record.completed_at = timezone.now()
            analysis_record.analysis = None
            analysis_record.save(
                update_fields=["status", "error", "completed_at", "analysis", "updated_at"]
            )

        payload = _serialize_analysis_record(
            analysis_record,
            include_analysis=analysis_record.status == GameAnalysis.STATUS_COMPLETED,
        )
        payload["can_analyze"] = game.status == Game.STATUS_FINISHED
        return Response(payload)







