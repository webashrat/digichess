from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class Game(models.Model):
    START_FEN = "rn1qkbnr/pppbpppp/8/3p4/3P4/5NP1/PPP1PP1P/RNBQKB1R w KQkq - 0 3"  # overwritten with real start below
    START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    TIME_BULLET = "bullet"
    TIME_BLITZ = "blitz"
    TIME_RAPID = "rapid"
    TIME_CLASSICAL = "classical"
    TIME_CUSTOM = "custom"

    TIME_CHOICES = [
        (TIME_BULLET, "Bullet"),
        (TIME_BLITZ, "Blitz"),
        (TIME_RAPID, "Rapid"),
        (TIME_CLASSICAL, "Classical"),
        (TIME_CUSTOM, "Custom"),
    ]

    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_FINISHED = "finished"
    STATUS_ABORTED = "aborted"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_FINISHED, "Finished"),
        (STATUS_ABORTED, "Aborted"),
    ]

    RESULT_WHITE = "1-0"
    RESULT_BLACK = "0-1"
    RESULT_DRAW = "1/2-1/2"
    RESULT_NONE = "*"

    RESULT_CHOICES = [
        (RESULT_WHITE, "White"),
        (RESULT_BLACK, "Black"),
        (RESULT_DRAW, "Draw"),
        (RESULT_NONE, "Unfinished"),
    ]

    creator = models.ForeignKey(User, related_name="games_created", on_delete=models.CASCADE)
    white = models.ForeignKey(User, related_name="games_as_white", on_delete=models.CASCADE)
    black = models.ForeignKey(User, related_name="games_as_black", on_delete=models.CASCADE)
    time_control = models.CharField(max_length=20, choices=TIME_CHOICES, default=TIME_BLITZ)
    rated = models.BooleanField(default=True, help_text="Whether this game affects player ratings")
    initial_time_seconds = models.IntegerField(default=300)
    increment_seconds = models.IntegerField(default=2)
    white_time_seconds = models.IntegerField(default=300)
    black_time_seconds = models.IntegerField(default=300)
    white_increment_seconds = models.IntegerField(default=2)
    black_increment_seconds = models.IntegerField(default=2)
    white_time_left = models.IntegerField(default=300)
    black_time_left = models.IntegerField(default=300)
    last_move_at = models.DateTimeField(null=True, blank=True)
    draw_offer_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="draw_offers_made"
    )
    rematch_requested_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="rematch_requests_made"
    )
    rematch_of = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name="rematches"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, default=RESULT_NONE)
    moves = models.TextField(blank=True, help_text="PGN moves in SAN, space separated")
    current_fen = models.TextField(default=START_FEN, help_text="Board state after last move")
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def start(self):
        if self.status == self.STATUS_PENDING:
            self.status = self.STATUS_ACTIVE
            self.started_at = timezone.now()
            # Start the clock only after the first move is made
            if (self.moves or "").strip():
                self.last_move_at = timezone.now()
            self.save(update_fields=["status", "started_at", "last_move_at"])
            
            # Initialize clock in Redis
            try:
                from utils.redis_client import get_redis
                import chess
                r = get_redis()
                board = chess.Board(self.current_fen or self.START_FEN)
                turn = "white" if board.turn is chess.WHITE else "black"
                mapping = {
                    "white_time_left": self.white_time_left,
                    "black_time_left": self.black_time_left,
                    "turn": turn,
                }
                if self.last_move_at:
                    mapping["last_move_at"] = int(self.last_move_at.timestamp())
                r.hset(f"game:clock:{self.id}", mapping=mapping)
            except Exception:
                pass  # Continue even if Redis initialization fails

    def add_move(self, move: str):
        move_list = (self.moves or "").strip().split()
        move_list.append(move)
        self.moves = " ".join(move_list)
        self.save(update_fields=["moves"])

    def finish(self, result: str):
        if result not in dict(self.RESULT_CHOICES):
            result = self.RESULT_NONE
        self.status = self.STATUS_FINISHED
        self.result = result
        self.finished_at = timezone.now()
        self.save(update_fields=["status", "result", "finished_at"])

    def __str__(self):
        return f"{self.white.email} vs {self.black.email} ({self.time_control})"


class GameAnalysis(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_RUNNING, "Running"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    game = models.OneToOneField(Game, related_name="analysis_cache", on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    source = models.CharField(max_length=40, blank=True)
    error = models.TextField(blank=True)
    analysis = models.JSONField(null=True, blank=True)
    quick_eval = models.JSONField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"Analysis for game {self.game_id} ({self.status})"


class Tournament(models.Model):
    TYPE_KNOCKOUT = "knockout"
    TYPE_ROUND_ROBIN = "round_robin"
    TYPE_ARENA = "arena"
    TYPE_SWISS = "swiss"

    TYPE_CHOICES = [
        (TYPE_KNOCKOUT, "Knockout"),
        (TYPE_ROUND_ROBIN, "Round Robin"),
        (TYPE_ARENA, "Arena"),
        (TYPE_SWISS, "Swiss"),
    ]

    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_COMPLETED, "Completed"),
    ]

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    creator = models.ForeignKey(User, related_name="tournaments_created", on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_KNOCKOUT)
    time_control = models.CharField(max_length=20, choices=Game.TIME_CHOICES, default=Game.TIME_BLITZ)
    initial_time_seconds = models.IntegerField(default=300)
    increment_seconds = models.IntegerField(default=0)
    start_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    winners = models.JSONField(default=list, blank=True, help_text="List of winner usernames in order")
    swiss_rounds = models.IntegerField(default=0)
    current_round = models.IntegerField(default=0)
    arena_duration_minutes = models.IntegerField(default=0)
    rated = models.BooleanField(default=True, help_text="Whether this tournament affects player ratings")
    password = models.CharField(max_length=255, blank=True, null=True, help_text="Entry code for private tournaments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Tournament: {self.name} ({self.type})"


class TournamentGame(models.Model):
    tournament = models.ForeignKey(Tournament, related_name="tournament_games", on_delete=models.CASCADE)
    game = models.ForeignKey(Game, related_name="tournament_entry", on_delete=models.CASCADE)
    round_number = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.tournament.name} - Game {self.game_id} (Round {self.round_number})"


class TournamentParticipant(models.Model):
    tournament = models.ForeignKey(Tournament, related_name="participants", on_delete=models.CASCADE)
    user = models.ForeignKey(User, related_name="tournament_participations", on_delete=models.CASCADE)
    joined_at = models.DateTimeField(auto_now_add=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("tournament", "user")
        ordering = ["joined_at"]

    def __str__(self):
        return f"{self.user.username} in {self.tournament.name}"
