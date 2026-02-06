from django.contrib import admin

from .models import Game, GameAnalysis


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "white",
        "black",
        "time_control",
        "status",
        "result",
        "created_at",
    )
    list_filter = ("time_control", "status", "result")
    search_fields = ("white__email", "black__email")


@admin.register(GameAnalysis)
class GameAnalysisAdmin(admin.ModelAdmin):
    list_display = ("game", "status", "source", "requested_at", "completed_at")
    list_filter = ("status", "source")
    search_fields = ("game__id", "game__white__email", "game__black__email")
