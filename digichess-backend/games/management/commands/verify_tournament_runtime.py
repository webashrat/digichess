import time
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from games.models import Game, Tournament, TournamentGame, TournamentParticipant

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Verify real runtime tournament lifecycle with Celery beat/worker: "
        "auto-start -> pairing generation -> auto-complete."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--prefix",
            type=str,
            default="runtime",
            help="Username prefix for seeded users (default: runtime).",
        )
        parser.add_argument(
            "--domain",
            type=str,
            default="load.test",
            help="Email domain for seeded users (default: load.test).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="Pass1234!",
            help="Password for seeded users.",
        )
        parser.add_argument(
            "--start-delay-seconds",
            type=int,
            default=8,
            help="Tournament start delay in seconds (default: 8).",
        )
        parser.add_argument(
            "--timeout-seconds",
            type=int,
            default=90,
            help="Overall timeout for each wait stage (default: 90).",
        )
        parser.add_argument(
            "--poll-seconds",
            type=float,
            default=1.0,
            help="Polling interval in seconds (default: 1).",
        )
        parser.add_argument(
            "--cleanup",
            action="store_true",
            help="Delete created tournament and generated games after verification.",
        )

    def _ensure_user(self, username: str, email: str, password: str):
        user, _ = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_active": True},
        )
        updates = []
        if user.email != email:
            user.email = email
            updates.append("email")
        if not user.is_active:
            user.is_active = True
            updates.append("is_active")
        user.set_password(password)
        updates.append("password")
        if updates:
            user.save(update_fields=updates)
        return user

    def _wait_until(self, label: str, predicate):
        deadline = time.time() + self.timeout_seconds
        while time.time() < deadline:
            if predicate():
                return
            time.sleep(self.poll_seconds)
        raise CommandError(f"Timeout while waiting for: {label}")

    def handle(self, *args, **options):
        prefix = options["prefix"].strip()
        domain = options["domain"].strip()
        password = options["password"]
        self.timeout_seconds = max(10, int(options["timeout_seconds"]))
        self.poll_seconds = max(0.2, float(options["poll_seconds"]))
        cleanup = bool(options["cleanup"])
        start_delay = max(2, int(options["start_delay_seconds"]))

        creator = self._ensure_user(
            username=f"{prefix}_creator",
            email=f"{prefix}_creator@{domain}",
            password=password,
        )
        players = []
        for index in range(1, 5):
            players.append(
                self._ensure_user(
                    username=f"{prefix}_{index:03d}",
                    email=f"{prefix}_{index:03d}@{domain}",
                    password=password,
                )
            )

        tournament = Tournament.objects.create(
            name=f"runtime-swiss-{int(time.time())}",
            description="runtime lifecycle verification",
            creator=creator,
            type=Tournament.TYPE_SWISS,
            time_control=Game.TIME_BLITZ,
            initial_time_seconds=60,
            increment_seconds=0,
            start_at=timezone.now() + timedelta(seconds=start_delay),
            rated=False,
            swiss_rounds=1,
            current_round=0,
        )
        for player in players:
            TournamentParticipant.objects.get_or_create(tournament=tournament, user=player)

        self.stdout.write(
            self.style.WARNING(
                f"Created runtime tournament {tournament.id}. Waiting for auto-start..."
            )
        )

        self._wait_until(
            label="tournament auto-start",
            predicate=lambda: Tournament.objects.filter(
                id=tournament.id,
                status=Tournament.STATUS_ACTIVE,
            ).exists(),
        )
        self.stdout.write(self.style.SUCCESS("Auto-start detected."))

        self._wait_until(
            label="initial pairings created",
            predicate=lambda: TournamentGame.objects.filter(tournament_id=tournament.id).exists(),
        )
        self.stdout.write(self.style.SUCCESS("Initial pairings detected."))

        now = timezone.now()
        open_games = TournamentGame.objects.filter(
            tournament_id=tournament.id,
            game__status__in=[Game.STATUS_PENDING, Game.STATUS_ACTIVE],
        ).select_related("game")
        for entry in open_games:
            game = entry.game
            game.status = Game.STATUS_FINISHED
            game.result = Game.RESULT_WHITE
            game.finished_at = now
            game.save(update_fields=["status", "result", "finished_at"])

        self.stdout.write("Marked round games as finished. Waiting for auto-complete...")
        self._wait_until(
            label="tournament auto-complete",
            predicate=lambda: Tournament.objects.filter(
                id=tournament.id,
                status=Tournament.STATUS_COMPLETED,
            ).exists(),
        )
        tournament.refresh_from_db()
        if not tournament.winners:
            raise CommandError("Tournament completed but winners list is empty.")

        self.stdout.write(
            self.style.SUCCESS(
                f"Runtime verification passed. tournament_id={tournament.id} winners={tournament.winners}"
            )
        )

        if cleanup:
            game_ids = list(
                TournamentGame.objects.filter(tournament=tournament).values_list(
                    "game_id", flat=True
                )
            )
            TournamentGame.objects.filter(tournament=tournament).delete()
            Game.objects.filter(id__in=game_ids).delete()
            TournamentParticipant.objects.filter(tournament=tournament).delete()
            tournament.delete()
            self.stdout.write("Cleanup complete.")
