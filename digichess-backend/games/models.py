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
    white_rating_delta = models.IntegerField(null=True, blank=True)
    black_rating_delta = models.IntegerField(null=True, blank=True)
    draw_offer_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="draw_offers_made"
    )
    rematch_requested_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="rematch_requests_made"
    )
    rematch_requested_at = models.DateTimeField(null=True, blank=True)
    rematch_of = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name="rematches"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, default=RESULT_NONE)
    moves = models.TextField(blank=True, help_text="PGN moves in SAN, space separated")
    move_times_ms = models.JSONField(
        default=list, blank=True,
        help_text="Per-move elapsed time in milliseconds, one entry per ply",
    )
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

    class Meta:
        unique_together = ("tournament", "user")
        ordering = ["joined_at"]

    def __str__(self):
        return f"{self.user.username} in {self.tournament.name}"


class DigiQuizQuestion(models.Model):
    source_id = models.CharField(max_length=64, unique=True)
    tag = models.CharField(max_length=120, db_index=True)
    question = models.TextField()
    options = models.JSONField(default=list)
    answer_index = models.PositiveSmallIntegerField()
    answer_text = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.source_id} ({self.tag})"


class DigiQuizRound(models.Model):
    STATUS_SCHEDULED = "scheduled"
    STATUS_JOIN_OPEN = "join_open"
    STATUS_LIVE = "live"
    STATUS_FINISHED = "finished"

    STATUS_CHOICES = [
        (STATUS_SCHEDULED, "Scheduled"),
        (STATUS_JOIN_OPEN, "Join Open"),
        (STATUS_LIVE, "Live"),
        (STATUS_FINISHED, "Finished"),
    ]

    round_date = models.DateField(unique=True, help_text="Round date in IST")
    join_open_at = models.DateTimeField()
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)
    is_official = models.BooleanField(default=False)
    questions_count = models.PositiveSmallIntegerField(default=20)
    question_duration_seconds = models.PositiveSmallIntegerField(default=20)
    finalized_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_at"]

    def __str__(self):
        return f"DigiQuiz Round {self.round_date} ({self.status})"


class DigiQuizRoundQuestion(models.Model):
    round = models.ForeignKey(DigiQuizRound, related_name="round_questions", on_delete=models.CASCADE)
    question = models.ForeignKey(DigiQuizQuestion, related_name="round_entries", on_delete=models.CASCADE)
    question_no = models.PositiveSmallIntegerField()
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        ordering = ["question_no"]
        constraints = [
            models.UniqueConstraint(fields=["round", "question_no"], name="uq_digiquiz_round_question_no"),
            models.UniqueConstraint(fields=["round", "question"], name="uq_digiquiz_round_question_unique"),
        ]

    def __str__(self):
        return f"Round {self.round_id} Q{self.question_no}"


class DigiQuizParticipation(models.Model):
    round = models.ForeignKey(DigiQuizRound, related_name="participations", on_delete=models.CASCADE)
    user = models.ForeignKey(User, related_name="digiquiz_participations", on_delete=models.CASCADE)
    joined_at = models.DateTimeField(auto_now_add=True)
    joined_question_no = models.PositiveSmallIntegerField(default=1)
    total_points = models.IntegerField(default=0)
    correct_count = models.PositiveIntegerField(default=0)
    wrong_count = models.PositiveIntegerField(default=0)
    resolved_count = models.PositiveIntegerField(default=0)
    total_answer_time_ms = models.PositiveIntegerField(default=0)
    last_answer_at = models.DateTimeField(null=True, blank=True)
    rating_applied = models.BooleanField(default=False)

    class Meta:
        ordering = ["-total_points", "-correct_count", "total_answer_time_ms", "joined_at"]
        constraints = [
            models.UniqueConstraint(fields=["round", "user"], name="uq_digiquiz_participation_round_user"),
        ]

    def __str__(self):
        return f"{self.user.username} in DigiQuiz round {self.round_id}"


class DigiQuizAnswer(models.Model):
    STATUS_CORRECT = "correct"
    STATUS_WRONG = "wrong"
    STATUS_TIMEOUT = "timeout"
    STATUS_MISSED_LATE = "missed_late_join"

    STATUS_CHOICES = [
        (STATUS_CORRECT, "Correct"),
        (STATUS_WRONG, "Wrong"),
        (STATUS_TIMEOUT, "Timeout"),
        (STATUS_MISSED_LATE, "Missed (Late Join)"),
    ]

    participation = models.ForeignKey(DigiQuizParticipation, related_name="answers", on_delete=models.CASCADE)
    round = models.ForeignKey(DigiQuizRound, related_name="answers", on_delete=models.CASCADE)
    question = models.ForeignKey(DigiQuizQuestion, related_name="answers", on_delete=models.CASCADE)
    question_no = models.PositiveSmallIntegerField()
    selected_index = models.SmallIntegerField(null=True, blank=True)
    is_correct = models.BooleanField(default=False)
    latency_ms = models.PositiveIntegerField(default=0)
    points = models.IntegerField(default=0)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES)
    answered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["question_no"]
        constraints = [
            models.UniqueConstraint(fields=["participation", "question_no"], name="uq_digiquiz_answer_participation_question"),
        ]
        indexes = [
            models.Index(fields=["round", "question_no"]),
            models.Index(fields=["participation", "question_no"]),
        ]

    def __str__(self):
        return f"Round {self.round_id} Q{self.question_no} answer by {self.participation.user_id}"


class DigiQuizRatingHistory(models.Model):
    user = models.ForeignKey(User, related_name="digiquiz_rating_history", on_delete=models.CASCADE)
    round = models.ForeignKey(DigiQuizRound, related_name="rating_history", on_delete=models.CASCADE)
    participation = models.OneToOneField(
        DigiQuizParticipation,
        related_name="rating_history_entry",
        on_delete=models.CASCADE,
    )
    rating_before = models.IntegerField()
    round_delta = models.IntegerField()
    rating_after = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["round__start_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "round"], name="uq_digiquiz_rating_round_user"),
        ]

    def __str__(self):
        return f"{self.user.username}: {self.rating_before}->{self.rating_after} (round {self.round_id})"


# ---------------------------------------------------------------------------
# Anti-Cheat: Reporting & Analysis
# Inspired by Lichess Irwin (https://github.com/clarkerubber/irwin, AGPL-3.0)
# and PGN-Spy T% methodology (https://github.com/MGleason1/PGN-Spy, MIT)
# ---------------------------------------------------------------------------


class CheatReport(models.Model):
    REASON_ENGINE = "engine_use"
    REASON_SUSPICIOUS = "suspicious_play"
    REASON_OTHER = "other"

    REASON_CHOICES = [
        (REASON_ENGINE, "Engine Assistance"),
        (REASON_SUSPICIOUS, "Suspicious Play"),
        (REASON_OTHER, "Other"),
    ]

    STATUS_PENDING = "pending"
    STATUS_UNDER_REVIEW = "under_review"
    STATUS_RESOLVED_CLEAN = "resolved_clean"
    STATUS_RESOLVED_CHEATING = "resolved_cheating"
    STATUS_DISMISSED = "dismissed"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_UNDER_REVIEW, "Under Review"),
        (STATUS_RESOLVED_CLEAN, "Resolved – Clean"),
        (STATUS_RESOLVED_CHEATING, "Resolved – Cheating"),
        (STATUS_DISMISSED, "Dismissed"),
    ]

    reporter = models.ForeignKey(
        User, related_name="cheat_reports_filed", on_delete=models.CASCADE
    )
    reported_user = models.ForeignKey(
        User, related_name="cheat_reports_against", on_delete=models.CASCADE
    )
    game = models.ForeignKey(
        Game, related_name="cheat_reports", on_delete=models.CASCADE
    )
    reason = models.CharField(max_length=30, choices=REASON_CHOICES, default=REASON_ENGINE)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PENDING)
    resolved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="cheat_reports_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "game"],
                name="uq_cheat_report_reporter_game",
            ),
        ]

    def __str__(self):
        return f"Report by {self.reporter_id} on {self.reported_user_id} (game {self.game_id})"


class CheatAnalysis(models.Model):
    """
    Combined analysis output per report.
    T1-T5 fields follow PGN-Spy Multi-PV methodology.
    Irwin score comes from the ported neural network.
    """

    VERDICT_CLEAN = "clean"
    VERDICT_SUSPICIOUS = "suspicious"
    VERDICT_LIKELY_CHEATING = "likely_cheating"

    VERDICT_CHOICES = [
        (VERDICT_CLEAN, "Clean"),
        (VERDICT_SUSPICIOUS, "Suspicious"),
        (VERDICT_LIKELY_CHEATING, "Likely Cheating"),
    ]

    report = models.OneToOneField(
        CheatReport, related_name="analysis", on_delete=models.CASCADE
    )
    game = models.ForeignKey(Game, related_name="cheat_analyses", on_delete=models.CASCADE)
    analyzed_user = models.ForeignKey(
        User, related_name="cheat_analyses", on_delete=models.CASCADE
    )

    t1_pct = models.FloatField(default=0, help_text="% moves matching engine top-1 choice")
    t2_pct = models.FloatField(default=0, help_text="% moves matching engine top-2")
    t3_pct = models.FloatField(default=0, help_text="% moves matching engine top-3")
    t4_pct = models.FloatField(default=0, help_text="% moves matching engine top-4")
    t5_pct = models.FloatField(default=0, help_text="% moves matching engine top-5")

    avg_centipawn_loss = models.FloatField(default=0)
    avg_winning_chances_loss = models.FloatField(default=0)
    best_move_streak = models.IntegerField(default=0)
    accuracy_score = models.FloatField(default=0, help_text="0-100 overall accuracy")

    position_stats = models.JSONField(
        default=dict, blank=True,
        help_text="T% and ACPL broken down by position category (undecided/losing/winning/post_losing)",
    )
    move_classifications = models.JSONField(
        default=list, blank=True,
        help_text="Per-move breakdown: san, cp_loss, wcl, rank, is_forced, position_category, classification",
    )
    forced_moves_excluded = models.IntegerField(default=0)
    book_moves_excluded = models.IntegerField(default=0)
    cp_loss_distribution = models.JSONField(
        default=dict, blank=True,
        help_text='Counts by bracket: {">0": N, ">10": N, ">25": N, ...}',
    )
    suspicious_moves = models.JSONField(
        default=list, blank=True,
        help_text="Moves in complex undecided positions that matched engine T1",
    )

    irwin_score = models.IntegerField(
        null=True, blank=True,
        help_text="0-100 from Irwin NN, null if model untrained",
    )

    verdict = models.CharField(max_length=30, choices=VERDICT_CHOICES, default=VERDICT_CLEAN)
    confidence = models.FloatField(default=0, help_text="0-1 confidence in verdict")
    full_analysis = models.JSONField(
        null=True, blank=True,
        help_text="Complete raw data including tensor features",
    )

    total_moves_analyzed = models.IntegerField(default=0)
    analyzed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-analyzed_at"]

    def __str__(self):
        return f"CheatAnalysis for report {self.report_id} – {self.verdict}"


class IrwinImportJob(models.Model):
    """Background CSV import job for Irwin training samples."""

    TYPE_CSV = "csv"
    TYPE_CHOICES = [
        (TYPE_CSV, "CSV Upload"),
    ]

    STATUS_QUEUED = "queued"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    upload_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_CSV)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    file_name = models.CharField(max_length=255)
    csv_content = models.TextField(blank=True)
    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)
    row_errors = models.JSONField(default=list, blank=True)
    detail = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        User, related_name="irwin_import_jobs", on_delete=models.CASCADE
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"IrwinImportJob {self.id} ({self.status})"


class IrwinTrainingData(models.Model):
    """
    Labeled data collected from report resolutions and manual imports.
    Tensor format follows Irwin's BasicGameModel (https://github.com/clarkerubber/irwin).
    """

    SOURCE_REPORT_RESOLUTION = "report_resolution"
    SOURCE_SINGLE_IMPORT = "single_import"
    SOURCE_CSV_IMPORT = "csv_import"
    SOURCE_CHOICES = [
        (SOURCE_REPORT_RESOLUTION, "Report Resolution"),
        (SOURCE_SINGLE_IMPORT, "Single Import"),
        (SOURCE_CSV_IMPORT, "CSV Import"),
    ]

    COLOR_WHITE = "white"
    COLOR_BLACK = "black"
    COLOR_CHOICES = [
        (COLOR_WHITE, "White"),
        (COLOR_BLACK, "Black"),
    ]

    FORMAT_AUTO = "auto"
    FORMAT_PGN = "pgn"
    FORMAT_SAN = "san"
    FORMAT_UCI = "uci"
    MOVE_FORMAT_CHOICES = [
        (FORMAT_AUTO, "Auto"),
        (FORMAT_PGN, "PGN"),
        (FORMAT_SAN, "SAN"),
        (FORMAT_UCI, "UCI"),
    ]

    game = models.ForeignKey(
        Game,
        related_name="irwin_training",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    player = models.ForeignKey(
        User,
        related_name="irwin_training",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    label = models.BooleanField(help_text="True = cheating, False = clean")
    tensor_data = models.JSONField(
        help_text="8-feature x 60-move tensor + piece types for Irwin NN",
    )
    source_type = models.CharField(
        max_length=30,
        choices=SOURCE_CHOICES,
        default=SOURCE_REPORT_RESOLUTION,
    )
    suspect_color = models.CharField(
        max_length=10,
        choices=COLOR_CHOICES,
        blank=True,
        default="",
    )
    moves_text = models.TextField(blank=True, default="")
    start_fen = models.TextField(
        blank=True,
        default=Game.START_FEN,
        help_text="Blank in the UI maps to the standard chess starting position.",
    )
    move_times_seconds = models.JSONField(default=list, blank=True)
    move_format = models.CharField(
        max_length=10,
        choices=MOVE_FORMAT_CHOICES,
        default=FORMAT_AUTO,
    )
    source_ref = models.TextField(blank=True, default="")
    external_id = models.CharField(max_length=120, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    import_job = models.ForeignKey(
        IrwinImportJob,
        related_name="samples",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    import_row_number = models.IntegerField(null=True, blank=True)
    labeled_by = models.ForeignKey(
        User, related_name="irwin_labels_given", on_delete=models.CASCADE
    )
    labeled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-labeled_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["game", "player"],
                name="uq_irwin_training_game_player",
            ),
        ]

    def __str__(self):
        label_str = "cheating" if self.label else "clean"
        if self.game_id and self.player_id:
            return f"IrwinTraining game={self.game_id} player={self.player_id} ({label_str})"
        ref = self.external_id or f"import:{self.id}"
        return f"IrwinTraining {ref} ({label_str})"
