"""
Puzzle views using Lichess Puzzle API
"""
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
import requests
import logging

logger = logging.getLogger(__name__)

LICHESS_API_BASE = "https://lichess.org/api"


class DailyPuzzleView(APIView):
    """Get the daily puzzle from Lichess"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request):
        try:
            url = f"{LICHESS_API_BASE}/puzzle/daily"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                return Response(response.json())
            else:
                return Response(
                    {"detail": "Failed to fetch daily puzzle"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
        except Exception as e:
            logger.error(f"Error fetching daily puzzle: {e}")
            return Response(
                {"detail": "Error fetching daily puzzle"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PuzzleView(APIView):
    """Get a puzzle by ID from Lichess"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, puzzle_id: str):
        try:
            url = f"{LICHESS_API_BASE}/puzzle/{puzzle_id}"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                return Response(response.json())
            else:
                return Response(
                    {"detail": f"Puzzle {puzzle_id} not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        except Exception as e:
            logger.error(f"Error fetching puzzle {puzzle_id}: {e}")
            return Response(
                {"detail": "Error fetching puzzle"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class NextPuzzleView(APIView):
    """Get a new random puzzle from Lichess"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request):
        try:
            url = f"{LICHESS_API_BASE}/puzzle/next"
            params = {
                "difficulty": request.query_params.get("difficulty", "easiest"),  # easiest, easier, normal, harder, hardest
                "color": request.query_params.get("color", "white"),  # white, black
                "theme": request.query_params.get("theme", None)  # Optional theme filter
            }
            # Remove None values
            params = {k: v for k, v in params.items() if v is not None}
            
            response = requests.get(url, params=params, timeout=5)
            
            if response.status_code == 200:
                return Response(response.json())
            else:
                return Response(
                    {"detail": "Failed to fetch puzzle"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
        except Exception as e:
            logger.error(f"Error fetching next puzzle: {e}")
            return Response(
                {"detail": "Error fetching puzzle"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PuzzleBatchView(APIView):
    """Get multiple puzzles at once from Lichess"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, angle: str = "mix"):
        """
        angle: Theme or opening (e.g., "mix", "endgame", "tactics")
        """
        try:
            url = f"{LICHESS_API_BASE}/puzzle/batch/{angle}"
            params = {
                "difficulty": request.query_params.get("difficulty", "easiest"),
                "nb": int(request.query_params.get("nb", 10)),  # Number of puzzles
            }
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                return Response(response.json())
            else:
                return Response(
                    {"detail": "Failed to fetch puzzles"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
        except Exception as e:
            logger.error(f"Error fetching puzzle batch: {e}")
            return Response(
                {"detail": "Error fetching puzzles"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

