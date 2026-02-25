import concurrent.futures
import time
from collections import defaultdict
from datetime import timedelta
from typing import Dict, List

import requests
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework.authtoken.models import Token

from games.models import Game, Tournament, TournamentGame
from games.tournament_lifecycle import (
    advance_tournament,
    finish_tournament,
    pair_idle_arena_players,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Run concurrent tournament API stress tests and validate invariants."

    def add_arguments(self, parser):
        parser.add_argument(
            "--base-url",
            type=str,
            default="http://127.0.0.1:8000",
            help="API host base URL (default: http://127.0.0.1:8000).",
        )
        parser.add_argument(
            "--api-prefix",
            type=str,
            default="/api",
            help="API prefix path (default: /api).",
        )
        parser.add_argument(
            "--prefix",
            type=str,
            default="stress",
            help="Username prefix used for seeded accounts (default: stress).",
        )
        parser.add_argument(
            "--domain",
            type=str,
            default="load.test",
            help="Seed email domain (default: load.test).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="Pass1234!",
            help="Seeded account password (default: Pass1234!).",
        )
        parser.add_argument(
            "--participants",
            type=int,
            default=16,
            help="Participant accounts used per tournament (default: 16).",
        )
        parser.add_argument(
            "--loops",
            type=int,
            default=3,
            help="How many rounds of stress to run per format (default: 3).",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=16,
            help="Thread pool size for concurrent API requests (default: 16).",
        )
        parser.add_argument(
            "--formats",
            type=str,
            default="arena,swiss,round_robin,knockout",
            help="Comma-separated tournament formats to run.",
        )
        parser.add_argument(
            "--request-timeout",
            type=float,
            default=10.0,
            help="HTTP request timeout seconds (default: 10).",
        )
        parser.add_argument(
            "--progress-steps",
            type=int,
            default=12,
            help="Max lifecycle progress steps for non-arena formats.",
        )
        parser.add_argument(
            "--arena-cycles",
            type=int,
            default=4,
            help="Pair/finish cycles for arena formats.",
        )

    def _url(self, path: str) -> str:
        return f"{self.base_url}{self.api_prefix}{path}"

    @staticmethod
    def _headers(token: str) -> Dict[str, str]:
        return {"Authorization": f"Token {token}"}

    def _request_json(self, method: str, path: str, token: str, payload=None):
        url = self._url(path)
        kwargs = {
            "headers": self._headers(token),
            "timeout": self.request_timeout,
        }
        if payload is not None:
            kwargs["json"] = payload
        response = requests.request(method=method, url=url, **kwargs)
        return response

    def _ensure_user(self, username: str, email: str) -> User:
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
        user.set_password(self.password)
        updates.append("password")
        if updates:
            user.save(update_fields=updates)
        return user

    def _seed_users(self) -> Dict[str, object]:
        creator_username = f"{self.prefix}_creator"
        creator = self._ensure_user(
            username=creator_username,
            email=f"{creator_username}@{self.domain}",
        )
        creator_token, _ = Token.objects.get_or_create(user=creator)

        participants: List[User] = []
        participant_tokens: Dict[int, str] = {}
        for index in range(1, self.participants + 1):
            username = f"{self.prefix}_{index:03d}"
            participant = self._ensure_user(
                username=username,
                email=f"{username}@{self.domain}",
            )
            token, _ = Token.objects.get_or_create(user=participant)
            participants.append(participant)
            participant_tokens[participant.id] = token.key

        return {
            "creator": creator,
            "creator_token": creator_token.key,
            "participants": participants,
            "participant_tokens": participant_tokens,
        }

    def _create_payload(self, fmt: str, loop_index: int) -> dict:
        payload = {
            "name": f"stress-{fmt}-{loop_index}-{int(time.time() * 1000)}",
            "description": "stress tournament",
            "type": fmt,
            "time_control": Game.TIME_BLITZ,
            "initial_time_seconds": 120,
            "increment_seconds": 0,
            "start_at": (timezone.now() + timedelta(minutes=5)).isoformat(),
            "rated": False,
        }
        if fmt == Tournament.TYPE_ARENA:
            payload["arena_duration_minutes"] = 10
        if fmt == Tournament.TYPE_SWISS:
            payload["swiss_rounds"] = 3
        return payload

    def _register_players_concurrently(
        self,
        tournament_id: int,
        participants: List[User],
        participant_tokens: Dict[int, str],
    ):
        def register_one(user: User):
            token = participant_tokens[user.id]
            response = self._request_json(
                "POST",
                f"/games/tournaments/{tournament_id}/register/",
                token=token,
                payload={},
            )
            return response.status_code, user.username, response.text

        failures = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [executor.submit(register_one, user) for user in participants]
            for future in concurrent.futures.as_completed(futures):
                status_code, username, body = future.result()
                if status_code != 200:
                    failures.append((username, status_code, body))
        if failures:
            sample = failures[:3]
            raise CommandError(f"Concurrent registration failures: {sample}")

    def _hammer_pairings_endpoint(self, tournament_id: int, creator_token: str):
        def call_pairings():
            response = self._request_json(
                "POST",
                f"/games/tournaments/{tournament_id}/pairings/",
                token=creator_token,
                payload={},
            )
            return response.status_code

        statuses = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(self.workers, 8)) as executor:
            futures = [executor.submit(call_pairings) for _ in range(8)]
            for future in concurrent.futures.as_completed(futures):
                statuses.append(future.result())
        if any(status >= 500 for status in statuses):
            raise CommandError(f"Pairings endpoint returned server errors: {statuses}")

    def _assert_invariants(self, tournament_id: int):
        tournament = Tournament.objects.get(id=tournament_id)
        participant_ids = set(
            tournament.participants.values_list("user_id", flat=True)
        )

        open_entries = TournamentGame.objects.filter(
            tournament=tournament,
            game__status__in=[Game.STATUS_PENDING, Game.STATUS_ACTIVE],
        ).select_related("game")
        open_counts = defaultdict(int)
        for tg in open_entries:
            game = tg.game
            open_counts[game.white_id] += 1
            open_counts[game.black_id] += 1

        offenders = {user_id: count for user_id, count in open_counts.items() if count > 1}
        if offenders:
            raise CommandError(
                f"Invariant failed: players have multiple open games in tournament {tournament_id}: {offenders}"
            )

        rounds = (
            TournamentGame.objects.filter(tournament=tournament)
            .values_list("round_number", flat=True)
            .distinct()
        )
        for round_number in rounds:
            seen_pairs = set()
            round_games = TournamentGame.objects.filter(
                tournament=tournament,
                round_number=round_number,
            ).select_related("game")
            for tg in round_games:
                pair = frozenset((tg.game.white_id, tg.game.black_id))
                if tournament.type != Tournament.TYPE_ARENA and pair in seen_pairs:
                    raise CommandError(
                        f"Invariant failed: duplicate pairing in round {round_number} for tournament {tournament_id}"
                    )
                seen_pairs.add(pair)
                if tg.game.white_id not in participant_ids or tg.game.black_id not in participant_ids:
                    raise CommandError(
                        f"Invariant failed: game has non-participant players in tournament {tournament_id}"
                    )

    @staticmethod
    def _finish_open_games(tournament: Tournament):
        open_entries = TournamentGame.objects.filter(
            tournament=tournament,
            game__status__in=[Game.STATUS_PENDING, Game.STATUS_ACTIVE],
        ).select_related("game")
        now = timezone.now()
        for index, tg in enumerate(open_entries):
            result = Game.RESULT_WHITE if index % 2 == 0 else Game.RESULT_BLACK
            game = tg.game
            game.status = Game.STATUS_FINISHED
            game.result = result
            game.finished_at = now
            game.save(update_fields=["status", "result", "finished_at"])

    def _simulate_lifecycle(self, tournament_id: int, fmt: str):
        tournament = Tournament.objects.get(id=tournament_id)
        if fmt == Tournament.TYPE_ARENA:
            for _ in range(self.arena_cycles):
                tournament.refresh_from_db()
                if tournament.status == Tournament.STATUS_COMPLETED:
                    break
                pair_idle_arena_players(tournament)
                self._assert_invariants(tournament_id)
                self._finish_open_games(tournament)
                advance_tournament(tournament, pair_idle_for_arena=False)
                self._assert_invariants(tournament_id)
            tournament.refresh_from_db()
            if tournament.status != Tournament.STATUS_COMPLETED:
                finish_tournament(tournament, finished_at=timezone.now())
            return

        for _ in range(self.progress_steps):
            tournament.refresh_from_db()
            if tournament.status == Tournament.STATUS_COMPLETED:
                break
            self._finish_open_games(tournament)
            advance_tournament(tournament, pair_idle_for_arena=False)
            self._assert_invariants(tournament_id)

        tournament.refresh_from_db()
        if tournament.status != Tournament.STATUS_COMPLETED:
            finish_tournament(tournament, finished_at=timezone.now())

    def _run_format_loop(self, fmt: str, loop_index: int, seeded):
        creator_token = seeded["creator_token"]
        payload = self._create_payload(fmt=fmt, loop_index=loop_index)
        create_response = self._request_json(
            "POST",
            "/games/tournaments/",
            token=creator_token,
            payload=payload,
        )
        if create_response.status_code != 201:
            raise CommandError(
                f"Failed to create {fmt} tournament: {create_response.status_code} {create_response.text}"
            )
        tournament_id = create_response.json()["id"]
        self._register_players_concurrently(
            tournament_id=tournament_id,
            participants=seeded["participants"],
            participant_tokens=seeded["participant_tokens"],
        )

        start_response = self._request_json(
            "POST",
            f"/games/tournaments/{tournament_id}/start/",
            token=creator_token,
            payload={},
        )
        if start_response.status_code != 200:
            raise CommandError(
                f"Failed to start {fmt} tournament {tournament_id}: {start_response.status_code} {start_response.text}"
            )

        if fmt in {
            Tournament.TYPE_ARENA,
            Tournament.TYPE_KNOCKOUT,
            Tournament.TYPE_ROUND_ROBIN,
        }:
            self._hammer_pairings_endpoint(tournament_id=tournament_id, creator_token=creator_token)

        self._assert_invariants(tournament_id=tournament_id)
        self._simulate_lifecycle(tournament_id=tournament_id, fmt=fmt)
        self._assert_invariants(tournament_id=tournament_id)

        tournament = Tournament.objects.get(id=tournament_id)
        if tournament.status != Tournament.STATUS_COMPLETED:
            raise CommandError(f"Tournament {tournament_id} did not reach completed status.")

    def handle(self, *args, **options):
        self.base_url = options["base_url"].rstrip("/")
        self.api_prefix = "/" + options["api_prefix"].strip("/")
        self.prefix = options["prefix"].strip()
        self.domain = options["domain"].strip()
        self.password = options["password"]
        self.participants = max(2, options["participants"])
        self.loops = max(1, options["loops"])
        self.workers = max(2, options["workers"])
        self.request_timeout = max(1.0, options["request_timeout"])
        self.progress_steps = max(3, options["progress_steps"])
        self.arena_cycles = max(1, options["arena_cycles"])
        formats = [
            value.strip()
            for value in options["formats"].split(",")
            if value.strip()
        ]

        allowed_formats = {
            Tournament.TYPE_ARENA,
            Tournament.TYPE_SWISS,
            Tournament.TYPE_ROUND_ROBIN,
            Tournament.TYPE_KNOCKOUT,
        }
        invalid = [fmt for fmt in formats if fmt not in allowed_formats]
        if invalid:
            raise CommandError(f"Unsupported formats: {invalid}")

        self.stdout.write(
            self.style.WARNING(
                f"Starting tournament stress run. base_url={self.base_url} formats={formats} loops={self.loops}"
            )
        )

        seeded = self._seed_users()
        start = time.perf_counter()
        completed = 0
        for fmt in formats:
            for loop_index in range(1, self.loops + 1):
                loop_start = time.perf_counter()
                self.stdout.write(f"[{fmt}] loop {loop_index}/{self.loops} ...")
                self._run_format_loop(fmt=fmt, loop_index=loop_index, seeded=seeded)
                elapsed = time.perf_counter() - loop_start
                completed += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[{fmt}] loop {loop_index}/{self.loops} completed in {elapsed:.2f}s"
                    )
                )

        total_elapsed = time.perf_counter() - start
        self.stdout.write(
            self.style.SUCCESS(
                f"Tournament stress run complete. scenarios={completed} elapsed={total_elapsed:.2f}s"
            )
        )
