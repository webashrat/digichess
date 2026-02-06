from django.contrib.auth import get_user_model
from django.db import models
from rest_framework import serializers
import chess
from datetime import timedelta

from accounts.serializers import UserSerializer
from .models import Game
from .game_core import FIRST_MOVE_GRACE_SECONDS, CHALLENGE_EXPIRY_MINUTES
from utils.email import send_email_notification

User = get_user_model()


TIME_DEFAULTS = {
    Game.TIME_BULLET: (60, 0),
    Game.TIME_BLITZ: (180, 0),
    Game.TIME_RAPID: (600, 0),
    Game.TIME_CLASSICAL: (1800, 10),
    Game.TIME_CUSTOM: (300, 0),
}


class GameSerializer(serializers.ModelSerializer):
    white = UserSerializer(read_only=True)
    black = UserSerializer(read_only=True)
    creator = UserSerializer(read_only=True)
    opponent_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    preferred_color = serializers.ChoiceField(
        choices=["white", "black", "auto"], required=False, allow_null=True, write_only=True
    )
    white_time_seconds = serializers.IntegerField(required=False, min_value=1)
    black_time_seconds = serializers.IntegerField(required=False, min_value=1)
    white_increment_seconds = serializers.IntegerField(required=False, min_value=0)
    black_increment_seconds = serializers.IntegerField(required=False, min_value=0)
    initial_time_seconds = serializers.IntegerField(required=False, min_value=1)
    increment_seconds = serializers.IntegerField(required=False, min_value=0)
    rated = serializers.BooleanField(required=False, default=True)
    current_fen = serializers.CharField(read_only=True)
    legal_moves = serializers.SerializerMethodField(read_only=True)
    first_move_deadline = serializers.SerializerMethodField(read_only=True)
    first_move_color = serializers.SerializerMethodField(read_only=True)
    move_count = serializers.SerializerMethodField(read_only=True)

    rematch_requested_by = serializers.SerializerMethodField()
    draw_offer_by = serializers.SerializerMethodField()
    
    class Meta:
        model = Game
        fields = (
            "id",
            "creator",
            "white",
            "black",
            "opponent_id",
            "preferred_color",
            "time_control",
            "rated",
            "initial_time_seconds",
            "increment_seconds",
            "white_time_seconds",
            "black_time_seconds",
            "white_increment_seconds",
            "black_increment_seconds",
            "white_time_left",
            "black_time_left",
            "status",
            "result",
            "moves",
            "current_fen",
            "legal_moves",
            "rematch_requested_by",
            "draw_offer_by",
            "created_at",
            "started_at",
            "finished_at",
            "first_move_deadline",
            "first_move_color",
            "move_count",
        )
        read_only_fields = (
            "status",
            "result",
            "moves",
            "created_at",
            "started_at",
            "finished_at",
            "white_time_left",
            "black_time_left",
            "first_move_deadline",
            "first_move_color",
            "move_count",
        )

    def get_legal_moves(self, obj):
        try:
            board = chess.Board(obj.current_fen or chess.STARTING_FEN)
            return [board.san(mv) for mv in board.legal_moves]
        except Exception:
            return []

    def get_move_count(self, obj):
        return len((obj.moves or "").strip().split()) if obj.moves else 0

    def get_first_move_deadline(self, obj):
        if obj.status != Game.STATUS_ACTIVE:
            return None
        move_count = self.get_move_count(obj)
        if move_count == 0 and obj.started_at:
            return int((obj.started_at + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)).timestamp())
        if move_count == 1 and obj.started_at:
            anchor = obj.last_move_at or obj.started_at
            return int((anchor + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)).timestamp())
        return None

    def get_first_move_color(self, obj):
        if obj.status != Game.STATUS_ACTIVE:
            return None
        move_count = self.get_move_count(obj)
        if move_count == 0:
            return "white"
        if move_count == 1:
            return "black"
        return None
    
    def get_rematch_requested_by(self, obj):
        return obj.rematch_requested_by.id if obj.rematch_requested_by else None

    def get_draw_offer_by(self, obj):
        return obj.draw_offer_by.id if obj.draw_offer_by else None

    def _validate_time_settings(
        self,
        time_control,
        white_time,
        black_time,
        white_inc,
        black_inc,
    ):
        # General bounds
        if white_time <= 0 or black_time <= 0 or white_time > 7200 or black_time > 7200:
            raise serializers.ValidationError("Time per side must be between 1 and 7200 seconds.")
        for inc in (white_inc, black_inc):
            if inc < 0 or inc > 60:
                raise serializers.ValidationError("Increment must be between 0 and 60 seconds.")

        symmetrical = white_time == black_time and white_inc == black_inc
        if time_control != Game.TIME_CUSTOM:
            if not symmetrical:
                raise serializers.ValidationError(
                    "For bullet/blitz/rapid/classical, time and increment must match for both players."
                )
            t = white_time
            if time_control == Game.TIME_BULLET and not (0 < t < 180):
                raise serializers.ValidationError("Bullet requires 0 < start time < 180 seconds.")
            if time_control == Game.TIME_BLITZ and not (180 <= t < 600):
                raise serializers.ValidationError("Blitz requires 180 <= start time < 600 seconds.")
            if time_control == Game.TIME_RAPID and not (600 <= t <= 1500):
                raise serializers.ValidationError("Rapid requires 600 <= start time <= 1500 seconds.")
            if time_control == Game.TIME_CLASSICAL and not (t > 1500 and t <= 7200):
                raise serializers.ValidationError("Classical requires start time > 1500 seconds (max 7200).")
        else:
            if symmetrical:
                raise serializers.ValidationError(
                    "Custom games require mismatched time or increment between the players."
                )

    def create(self, validated_data):
        opponent_id = validated_data.pop("opponent_id", None)
        preferred_color = validated_data.pop("preferred_color", "white") or "white"
        initial_time = validated_data.pop("initial_time_seconds", None)
        increment = validated_data.pop("increment_seconds", None)
        white_time = validated_data.pop("white_time_seconds", None)
        black_time = validated_data.pop("black_time_seconds", None)
        white_increment = validated_data.pop("white_increment_seconds", None)
        black_increment = validated_data.pop("black_increment_seconds", None)
        requester = self.context["request"].user
        if opponent_id is None:
            active_ids = set(
                Game.objects.filter(status=Game.STATUS_ACTIVE).values_list("white_id", flat=True)
            ) | set(
                Game.objects.filter(status=Game.STATUS_ACTIVE).values_list("black_id", flat=True)
            )
            candidate = (
                User.objects.filter(is_online=True)
                .exclude(id=requester.id)
                .exclude(id__in=active_ids)
                .order_by("?")
                .first()
            )
            if not candidate:
                raise serializers.ValidationError("No available opponent found.")
            opponent = candidate
        else:
            try:
                opponent = User.objects.get(id=opponent_id)
            except User.DoesNotExist:
                raise serializers.ValidationError("Opponent not found.")
        if opponent == requester:
            raise serializers.ValidationError("Cannot play against yourself.")
        # Block creating a new game if either player is already in an active game
        active_conflict = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            (models.Q(white=requester) | models.Q(black=requester)) | (models.Q(white=opponent) | models.Q(black=opponent))
        )
        if active_conflict.exists():
            raise serializers.ValidationError("One of the players is already in an active game.")

        time_control = validated_data.pop("time_control", None)
        if not time_control:
            raise serializers.ValidationError("time_control is required.")
        base_time, base_increment = TIME_DEFAULTS.get(time_control, TIME_DEFAULTS[Game.TIME_BLITZ])
        base_time = initial_time if initial_time is not None else base_time
        base_increment = increment if increment is not None else base_increment

        # For custom, both times must be explicitly provided
        if time_control == Game.TIME_CUSTOM and (white_time is None or black_time is None):
            raise serializers.ValidationError("Custom games require both white_time_seconds and black_time_seconds.")

        white_time = white_time if white_time is not None else base_time
        black_time = black_time if black_time is not None else base_time
        white_increment = white_increment if white_increment is not None else base_increment
        black_increment = black_increment if black_increment is not None else base_increment

        symmetrical = white_time == black_time and white_increment == black_increment

        # If user selected a rated control but provided asymmetric settings, force custom
        if time_control != Game.TIME_CUSTOM and not symmetrical:
            time_control = Game.TIME_CUSTOM

        # For custom, time for both sides is mandatory
        if time_control == Game.TIME_CUSTOM and (white_time is None or black_time is None):
            raise serializers.ValidationError("Custom games require both white_time_seconds and black_time_seconds.")

        self._validate_time_settings(
            time_control,
            white_time,
            black_time,
            white_increment,
            black_increment,
        )

        initial_time = max(white_time, black_time)
        increment = max(white_increment, black_increment)

        white_player, black_player = (requester, opponent)
        if preferred_color == "black":
            white_player, black_player = opponent, requester
        elif preferred_color == "auto":
            import random

            if random.choice([True, False]):
                white_player, black_player = opponent, requester

        # Custom games are always unrated
        rated = validated_data.pop("rated", True) if time_control != Game.TIME_CUSTOM else False
        
        game = Game.objects.create(
            creator=requester,
            white=white_player,
            black=black_player,
            time_control=time_control,
            rated=rated,
            initial_time_seconds=initial_time,
            increment_seconds=increment,
            white_time_seconds=white_time,
            black_time_seconds=black_time,
            white_increment_seconds=white_increment,
            black_increment_seconds=black_increment,
            white_time_left=white_time,
            black_time_left=black_time,
            current_fen=chess.STARTING_FEN,
            **validated_data,
        )
        challenge_expiry_hours = CHALLENGE_EXPIRY_MINUTES / 60
        # Send notification to opponent (incoming challenge)
        try:
            from notifications.views import create_notification
            notification = create_notification(
                user=opponent,
                notification_type='game_challenge',
                title='New Game Challenge',
                message=f"{requester.username or requester.email} challenged you to a {time_control} game",
                data={
                    'game_id': game.id,
                    'from_user_id': requester.id,
                    'from_username': requester.username,
                    'time_control': time_control,
                    'white_time': white_time,
                    'black_time': black_time,
                    'white_inc': white_increment,
                    'black_inc': black_increment,
                },
                expires_in_hours=challenge_expiry_hours
            )
            import sys
            print(f"[game_create] Notification created for opponent {opponent.id} (username: {opponent.username}): notification_id={notification.id}, game_id={game.id}", file=sys.stdout)
        except Exception as e:
            import sys
            import traceback
            print(f"[game_create] Failed to create notification for opponent {opponent.id}: {e}", file=sys.stderr)
            print(f"[game_create] Traceback: {traceback.format_exc()}", file=sys.stderr)

        # Send notification to creator (outgoing challenge)
        try:
            from notifications.views import create_notification
            create_notification(
                user=requester,
                notification_type='game_challenge',
                title='Challenge Sent',
                message=f"Challenge sent to {opponent.username or opponent.email}",
                data={
                    'game_id': game.id,
                    'from_user_id': requester.id,
                    'from_username': requester.username,
                    'to_user_id': opponent.id,
                    'to_username': opponent.username or opponent.email,
                    'time_control': time_control,
                    'white_time': white_time,
                    'black_time': black_time,
                    'white_inc': white_increment,
                    'black_inc': black_increment,
                },
                expires_in_hours=challenge_expiry_hours
            )
        except Exception:
            pass
        
        # Also send email notification
        send_email_notification(
            "game_challenge",
            opponent.email,
            {
                "from_user": requester.name or requester.email,
                "time_summary": time_control,
                "white_time": white_time,
                "black_time": black_time,
                "white_inc": white_increment,
                "black_inc": black_increment,
            },
        )
        return game


class MoveSerializer(serializers.Serializer):
    move = serializers.CharField(max_length=20)
