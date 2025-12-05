from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Game
from .models_prediction import Prediction
from .serializers_prediction import PredictionSerializer


class PredictionCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, game_id: int):
        game = get_object_or_404(Game, id=game_id)
        if len((game.moves or "").split()) > 10:
            return Response({"detail": "Predictions only allowed within first 5 moves each."}, status=status.HTTP_400_BAD_REQUEST)
        if game.status not in [Game.STATUS_ACTIVE, Game.STATUS_PENDING]:
            return Response({"detail": "Game not active."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user in [game.white, game.black]:
            return Response({"detail": "Players cannot place predictions."}, status=status.HTTP_400_BAD_REQUEST)
        predicted = request.data.get("predicted_result")
        if predicted not in ["white", "black", "draw"]:
            return Response({"detail": "Invalid predicted_result."}, status=status.HTTP_400_BAD_REQUEST)
        pred, created = Prediction.objects.get_or_create(
            user=request.user, game=game, defaults={"predicted_result": predicted}
        )
        if not created:
            return Response({"detail": "Already predicted for this game."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PredictionSerializer(pred).data, status=status.HTTP_201_CREATED)
