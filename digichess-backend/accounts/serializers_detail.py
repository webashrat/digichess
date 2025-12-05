from django.contrib.auth import get_user_model
from rest_framework import serializers
from django.db.models import Q

from accounts.serializers import UserSerializer
from games.models import Game

User = get_user_model()


class UserDetailSerializer(UserSerializer):
    stats = serializers.SerializerMethodField()
    is_playing = serializers.SerializerMethodField()
    spectate_game_id = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ("stats", "is_playing", "spectate_game_id")
        read_only_fields = UserSerializer.Meta.read_only_fields

    def _aggregate(self, qs):
        total = qs.count()
        wins = qs.filter(
            (Q(white=self.instance) & Q(result=Game.RESULT_WHITE))
            | (Q(black=self.instance) & Q(result=Game.RESULT_BLACK))
        ).count()
        draws = qs.filter(result=Game.RESULT_DRAW).count()
        games_as_white = qs.filter(white=self.instance).count()
        games_as_black = qs.filter(black=self.instance).count()
        win_pct = (wins / total * 100) if total else 0
        win_pct_white = (qs.filter(white=self.instance, result=Game.RESULT_WHITE).count() / games_as_white * 100) if games_as_white else 0
        win_pct_black = (qs.filter(black=self.instance, result=Game.RESULT_BLACK).count() / games_as_black * 100) if games_as_black else 0
        return {
            "games_played": total,
            "wins": wins,
            "win_percentage": round(win_pct, 2),
            "games_as_white": games_as_white,
            "games_as_black": games_as_black,
            "win_percentage_white": round(win_pct_white, 2),
            "win_percentage_black": round(win_pct_black, 2),
            "draws": draws,
        }

    def get_stats(self, obj):
        base_qs = Game.objects.filter(Q(white=obj) | Q(black=obj)).filter(
            result__in=[Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW]
        )
        modes = {}
        for mode in [Game.TIME_BULLET, Game.TIME_BLITZ, Game.TIME_RAPID, Game.TIME_CLASSICAL, Game.TIME_CUSTOM]:
            modes[mode] = self._aggregate(base_qs.filter(time_control=mode))
        total_stats = self._aggregate(base_qs)
        total_stats["modes"] = {
            "bullet": modes.get(Game.TIME_BULLET, {}),
            "blitz": modes.get(Game.TIME_BLITZ, {}),
            "rapid": modes.get(Game.TIME_RAPID, {}),
            "classical": modes.get(Game.TIME_CLASSICAL, {}),
            "custom": modes.get(Game.TIME_CUSTOM, {}),
        }
        return {"total": total_stats}

    def get_is_playing(self, obj):
        return Game.objects.filter(
            Q(white=obj) | Q(black=obj), status=Game.STATUS_ACTIVE
        ).exists()

    def get_spectate_game_id(self, obj):
        game = (
            Game.objects.filter(Q(white=obj) | Q(black=obj), status=Game.STATUS_ACTIVE)
            .order_by("-created_at")
            .first()
        )
        return game.id if game else None
