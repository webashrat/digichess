from django.contrib import admin

from .models import Game


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
