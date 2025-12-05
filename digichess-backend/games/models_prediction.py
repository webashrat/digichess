from django.db import models
from django.contrib.auth import get_user_model
from .models import Game

User = get_user_model()


class Prediction(models.Model):
    RESULT_WHITE = "white"
    RESULT_BLACK = "black"
    RESULT_DRAW = "draw"

    RESULT_CHOICES = [
        (RESULT_WHITE, "White wins"),
        (RESULT_BLACK, "Black wins"),
        (RESULT_DRAW, "Draw"),
    ]

    user = models.ForeignKey(User, related_name="predictions", on_delete=models.CASCADE)
    game = models.ForeignKey(Game, related_name="predictions", on_delete=models.CASCADE)
    predicted_result = models.CharField(max_length=10, choices=RESULT_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)
    correct = models.BooleanField(default=False)

    class Meta:
        unique_together = ("user", "game")
        ordering = ["-created_at"]
