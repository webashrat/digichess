from datetime import datetime

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Game, Tournament, TournamentParticipant

User = get_user_model()


class TournamentSerializer(serializers.ModelSerializer):
    participants_count = serializers.IntegerField(read_only=True)
    creator = serializers.SerializerMethodField()
    is_private = serializers.SerializerMethodField()

    class Meta:
        model = Tournament
        fields = (
            "id",
            "name",
            "description",
            "creator",
            "type",
            "time_control",
            "initial_time_seconds",
            "increment_seconds",
            "start_at",
            "status",
            "started_at",
            "finished_at",
            "winners",
            "participants_count",
            "created_at",
            "swiss_rounds",
            "current_round",
            "arena_duration_minutes",
            "rated",
            "password",
            "is_private",
        )
        read_only_fields = ("status", "started_at", "finished_at", "winners", "participants_count", "created_at", "is_private")
        extra_kwargs = {
            "password": {"write_only": True}  # Don't expose password in GET requests
        }

    def get_creator(self, obj):
        return {"id": obj.creator_id, "username": obj.creator.username}
    
    def get_is_private(self, obj):
        return bool(obj.password)

    def validate(self, attrs):
        start_at = attrs.get("start_at")
        if start_at and start_at < datetime.now(start_at.tzinfo):
            raise serializers.ValidationError("start_at must be in the future.")
        ttype = attrs.get("type", Tournament.TYPE_KNOCKOUT)
        if ttype == Tournament.TYPE_ARENA and attrs.get("arena_duration_minutes", 0) <= 0:
            raise serializers.ValidationError("arena_duration_minutes must be > 0 for arena tournaments.")
        if ttype == Tournament.TYPE_SWISS and attrs.get("swiss_rounds", 0) <= 0:
            raise serializers.ValidationError("swiss_rounds must be > 0 for swiss tournaments.")
        return attrs

    def create(self, validated_data):
        validated_data["creator"] = self.context["request"].user
        return super().create(validated_data)


class TournamentRegisterSerializer(serializers.Serializer):
    tournament_id = serializers.IntegerField()
    password = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        tournament_id = attrs.get("tournament_id")
        password = attrs.get("password", "")
        
        try:
            tournament = Tournament.objects.get(id=tournament_id)
        except Tournament.DoesNotExist:
            raise serializers.ValidationError("Tournament not found.")
        
        # Check password if tournament has one
        if tournament.password:
            if not password or password != tournament.password:
                raise serializers.ValidationError("Invalid entry code.")
        
        attrs["tournament"] = tournament
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        tournament = self.validated_data.get("tournament")
        participant, _ = TournamentParticipant.objects.get_or_create(tournament=tournament, user=user)
        return participant


class TournamentWinnersSerializer(serializers.Serializer):
    winners = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=True,
    )
