from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import CheatReport, CheatAnalysis, IrwinTrainingData

User = get_user_model()


class _MiniUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "profile_pic", "rating_bullet", "rating_blitz", "rating_rapid", "rating_classical")


class CheatReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheatReport
        fields = ("game", "reason", "description")

    def validate_game(self, game):
        from .models import Game
        if game.status != Game.STATUS_FINISHED:
            raise serializers.ValidationError("Can only report on finished games.")
        return game

    def validate(self, attrs):
        request = self.context["request"]
        game = attrs["game"]

        if game.white_id == request.user.id:
            attrs["reported_user"] = game.black
        elif game.black_id == request.user.id:
            attrs["reported_user"] = game.white
        else:
            raise serializers.ValidationError("You can only report your opponent.")

        if attrs["reported_user"].is_bot:
            raise serializers.ValidationError("Cannot report a bot.")

        if CheatReport.objects.filter(reporter=request.user, game=game).exists():
            raise serializers.ValidationError("You already reported this game.")

        return attrs

    def create(self, validated_data):
        validated_data["reporter"] = self.context["request"].user
        return super().create(validated_data)


class CheatAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheatAnalysis
        fields = (
            "id",
            "t1_pct", "t2_pct", "t3_pct", "t4_pct", "t5_pct",
            "avg_centipawn_loss", "avg_winning_chances_loss",
            "best_move_streak", "accuracy_score",
            "position_stats", "move_classifications",
            "forced_moves_excluded", "book_moves_excluded",
            "cp_loss_distribution", "suspicious_moves",
            "irwin_score", "verdict", "confidence",
            "total_moves_analyzed", "analyzed_at",
        )


class CheatReportSerializer(serializers.ModelSerializer):
    reporter = _MiniUserSerializer(read_only=True)
    reported_user = _MiniUserSerializer(read_only=True)
    resolved_by = _MiniUserSerializer(read_only=True)
    analysis = CheatAnalysisSerializer(read_only=True)

    game_summary = serializers.SerializerMethodField()

    class Meta:
        model = CheatReport
        fields = (
            "id", "reporter", "reported_user", "game", "game_summary",
            "reason", "description", "status",
            "resolved_by", "resolved_at", "admin_notes",
            "created_at", "analysis",
        )

    def get_game_summary(self, obj):
        game = obj.game
        return {
            "id": game.id,
            "white_username": game.white.username,
            "black_username": game.black.username,
            "time_control": game.time_control,
            "result": game.result,
            "move_count": len((game.moves or "").split()) if game.moves else 0,
            "finished_at": game.finished_at.isoformat() if game.finished_at else None,
        }


class ResolveReportSerializer(serializers.Serializer):
    resolution = serializers.ChoiceField(
        choices=["resolved_clean", "resolved_cheating", "dismissed"]
    )
    admin_notes = serializers.CharField(required=False, allow_blank=True, default="")


class IrwinStatusSerializer(serializers.Serializer):
    is_trained = serializers.BooleanField()
    labeled_count = serializers.IntegerField()
    cheating_count = serializers.IntegerField()
    clean_count = serializers.IntegerField()
    training_threshold = serializers.IntegerField()
    ready_to_train = serializers.BooleanField()
    model_path = serializers.CharField()
