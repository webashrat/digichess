import chess
import chess.engine
import chess.pgn
from io import StringIO
from pathlib import Path
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
import requests
import os

from .models import Game
from .serializers import GameSerializer


class GameFullAnalysisView(APIView):
    """Full game analysis with Stockfish or Lichess API"""
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk: int):
        """Request full game analysis"""
        game = get_object_or_404(Game, id=pk)
        
        # Check if game is finished
        if game.status not in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response(
                {"detail": "Analysis is only available for finished games."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try Stockfish first
        engine_path = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH"))
        analysis_data = None
        
        if not engine_path:
            return Response(
                {
                    "detail": "STOCKFISH_PATH not configured. Set it in settings or environment variables.",
                    "suggestion": "Set STOCKFISH_PATH=/usr/local/bin/stockfish"
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        engine_path_obj = Path(engine_path)
        if not engine_path_obj.exists():
            return Response(
                {
                    "detail": f"Stockfish not found at path: {engine_path}",
                    "engine_path": engine_path,
                    "suggestion": "Verify STOCKFISH_PATH is correct or install Stockfish"
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        if not os.access(engine_path, os.X_OK):
            return Response(
                {
                    "detail": f"Stockfish found at {engine_path} but is not executable. Run: chmod +x {engine_path}",
                    "engine_path": engine_path
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        # Try to analyze with Stockfish
        try:
            analysis_data = self._analyze_with_stockfish(game, engine_path)
        except Exception as exc:
            # Return detailed error for debugging
            return Response(
                {
                    "detail": f"Stockfish analysis failed: {str(exc)}",
                    "engine_path": engine_path,
                    "error_type": type(exc).__name__,
                    "game_id": game.id,
                    "game_moves": game.moves[:100] if game.moves else "No moves",
                    "game_status": game.status
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        return Response({
            "game_id": game.id,
            "analysis": analysis_data,
            "source": "stockfish",
            "engine_path": engine_path
        })

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
                # Analyze each position
                # Start from the initial position (or custom starting FEN if specified)
                start_fen = game.current_fen if game.current_fen and game.current_fen != chess.STARTING_FEN else None
                temp_board = chess.Board(start_fen) if start_fen else chess.Board()
                
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
        """Analyze game using Lichess API"""
        # Convert game to PGN format
        pgn = StringIO()
        exporter = chess.pgn.StringExporter(headers=False, variations=False, comments=False)
        
        # Create PGN from moves
        pgn_game = chess.pgn.Game()
        pgn_game.headers["White"] = game.white.username or game.white.email
        pgn_game.headers["Black"] = game.black.username or game.black.email
        pgn_game.headers["Result"] = game.result or "*"
        
        node = pgn_game
        board = chess.Board()
        moves = game.moves.split() if game.moves else []
        
        for move_san in moves:
            try:
                move = board.parse_san(move_san)
                node = node.add_variation(move)
                board.push(move)
            except Exception:
                continue
        
        pgn_str = str(pgn_game)
        
        # Request analysis from Lichess API
        # Note: Lichess doesn't have a direct public API for this, so we'll use a workaround
        # For now, return basic analysis structure
        # In production, you might want to use Lichess's cloud analysis or implement your own
        
        return {
            "moves": [],
            "summary": {
                "total_moves": len(moves),
                "analyzed_moves": 0,
                "note": "Full analysis requires Stockfish configuration. Basic analysis available."
            },
            "lichess_url": f"https://lichess.org/analysis/{game.current_fen or chess.STARTING_FEN}"
        }


class GameAnalysisRequestView(APIView):
    """Request analysis for a finished game"""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        """Get analysis status"""
        game = get_object_or_404(Game, id=pk)
        
        # For now, return basic info
        # In future, you could store analysis results in DB
        return Response({
            "game_id": game.id,
            "status": "available" if game.status in [Game.STATUS_FINISHED, Game.STATUS_ABORTED] else "not_available",
            "can_analyze": game.status in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]
        })







