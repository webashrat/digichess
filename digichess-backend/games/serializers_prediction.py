from rest_framework import serializers

from .models_prediction import Prediction


class PredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prediction
        fields = ("id", "game", "predicted_result", "created_at", "resolved", "correct")
        read_only_fields = ("id", "created_at", "resolved", "correct", "game")
