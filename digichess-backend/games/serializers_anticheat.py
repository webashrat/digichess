from rest_framework import serializers
from django.contrib.auth import get_user_model

from .irwin_imports import count_csv_rows
from .models import CheatReport, CheatAnalysis, IrwinImportJob, IrwinTrainingData

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


class IrwinTrainingDataSerializer(serializers.ModelSerializer):
    labeled_by = _MiniUserSerializer(read_only=True)
    label_name = serializers.SerializerMethodField()

    class Meta:
        model = IrwinTrainingData
        fields = (
            "id",
            "game",
            "player",
            "label",
            "label_name",
            "source_type",
            "suspect_color",
            "moves_text",
            "start_fen",
            "move_times_seconds",
            "move_format",
            "source_ref",
            "external_id",
            "notes",
            "import_job",
            "import_row_number",
            "labeled_by",
            "labeled_at",
        )
        read_only_fields = fields

    def get_label_name(self, obj):
        return "cheat" if obj.label else "clean"


class IrwinImportJobSerializer(serializers.ModelSerializer):
    uploaded_by = _MiniUserSerializer(read_only=True)

    class Meta:
        model = IrwinImportJob
        fields = (
            "id",
            "upload_type",
            "status",
            "file_name",
            "total_rows",
            "processed_rows",
            "imported_rows",
            "failed_rows",
            "row_errors",
            "detail",
            "uploaded_by",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class SingleIrwinImportSerializer(serializers.Serializer):
    moves = serializers.CharField()
    suspect_color = serializers.ChoiceField(
        choices=[IrwinTrainingData.COLOR_WHITE, IrwinTrainingData.COLOR_BLACK]
    )
    label = serializers.ChoiceField(choices=["clean", "cheat"])
    move_times_seconds = serializers.CharField(required=False, allow_blank=True, default="")
    start_fen = serializers.CharField(required=False, allow_blank=True, default="")
    move_format = serializers.ChoiceField(
        choices=[
            IrwinTrainingData.FORMAT_AUTO,
            IrwinTrainingData.FORMAT_PGN,
            IrwinTrainingData.FORMAT_SAN,
            IrwinTrainingData.FORMAT_UCI,
        ],
        required=False,
        default=IrwinTrainingData.FORMAT_AUTO,
    )
    source_ref = serializers.CharField(required=False, allow_blank=True, default="")
    external_id = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class IrwinCsvUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, file_obj):
        name = (getattr(file_obj, "name", "") or "").lower()
        if not name.endswith(".csv"):
            raise serializers.ValidationError("Only CSV files are supported.")

        try:
            preview = file_obj.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise serializers.ValidationError("CSV must be UTF-8 encoded.") from exc
        finally:
            file_obj.seek(0)

        try:
            row_count = count_csv_rows(preview)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if row_count <= 0:
            raise serializers.ValidationError("CSV must include at least one data row.")

        self.context["csv_content"] = preview
        self.context["row_count"] = row_count
        return file_obj
