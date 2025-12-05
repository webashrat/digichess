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
        
        if engine_path and Path(engine_path).exists():
            try:
                analysis_data = self._analyze_with_stockfish(game, engine_path)
            except Exception as exc:
                # Fall back to Lichess API
                pass
        
        # Fallback to Lichess API if Stockfish fails or not configured
        if not analysis_data:
            try:
                analysis_data = self._analyze_with_lichess(game)
            except Exception as exc:
                return Response(
                    {"detail": f"Analysis failed: {str(exc)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return Response({
            "game_id": game.id,
            "analysis": analysis_data,
            "source": "stockfish" if engine_path and Path(engine_path).exists() else "lichess"
        })

    def _analyze_with_stockfish(self, game: Game, engine_path: str):
        """Analyze game with local Stockfish"""
        board = chess.Board(game.current_fen or chess.STARTING_FEN)
        moves = game.moves.split() if game.moves else []
        
        analysis_moves = []
        
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            # Analyze each position
            temp_board = chess.Board()
            for i, move_san in enumerate(moves):
                try:
                    move = temp_board.parse_san(move_san)
                    temp_board.push(move)
                    
                    # Analyze position after this move
                    limit = chess.engine.Limit(time=0.3, depth=15)
                    result = engine.analyse(temp_board, limit)
                    score = result.get("score")
                    pv = result.get("pv", [])
                    
                    eval_score = None
                    mate = None
                    if score:
                        cp_score = score.pov(chess.WHITE).score(mate_score=100000)
                        if cp_score is not None:
                            eval_score = cp_score / 100.0  # Convert to pawns
                        mate = score.pov(chess.WHITE).mate()
                    
                    analysis_moves.append({
                        "move": move_san,
                        "move_number": i + 1,
                        "eval": eval_score,
                        "mate": mate,
                        "best_move": temp_board.san(pv[0]) if pv else None,
                        "depth": result.get("depth", 0)
                    })
                except Exception:
                    continue
        
        return {
            "moves": analysis_moves,
            "summary": {
                "total_moves": len(analysis_moves),
                "analyzed_moves": len([m for m in analysis_moves if m.get("eval") is not None])
            }
        }

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






