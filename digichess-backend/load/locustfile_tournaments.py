import os
import random
from datetime import datetime, timedelta, timezone

from locust import HttpUser, between, task

PASSWORD = os.getenv("TOURNAMENT_LOAD_PASSWORD", "Pass1234!")
USER_PREFIX = os.getenv("TOURNAMENT_LOAD_USER_PREFIX", "load")
USER_DOMAIN = os.getenv("TOURNAMENT_LOAD_USER_DOMAIN", "load.test")
USER_COUNT = int(os.getenv("TOURNAMENT_LOAD_USER_COUNT", "200"))
API_PREFIX = os.getenv("TOURNAMENT_LOAD_API_PREFIX", "/api")


def api_path(path: str) -> str:
    clean = "/" + path.lstrip("/")
    return f"{API_PREFIX.rstrip('/')}{clean}"


class TournamentReaderUser(HttpUser):
    wait_time = between(1, 3)
    weight = 5

    def on_start(self):
        self.headers = {}
        self.tournaments = []
        self._login()

    def _login(self):
        idx = random.randint(1, USER_COUNT)
        username = f"{USER_PREFIX}_{idx:03d}"
        payload = {"username": username, "password": PASSWORD}
        with self.client.post(
            api_path("/accounts/login/"),
            json=payload,
            name="auth_login",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"login failed for {username}: {response.status_code}")
                return
            token = response.json().get("token")
            if not token:
                response.failure("token missing in login response")
                return
            self.headers = {"Authorization": f"Token {token}"}
            response.success()

    @task(5)
    def list_tournaments(self):
        with self.client.get(
            api_path("/games/tournaments/?page_size=20"),
            headers=self.headers,
            name="tournaments_list",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"list failed: {response.status_code}")
                return
            payload = response.json() or {}
            rows = []
            for row in payload.get("results", []):
                tid = row.get("id")
                if tid is None:
                    continue
                rows.append({
                    "id": tid,
                    "status": row.get("status"),
                    "is_private": bool(row.get("is_private")),
                })
            self.tournaments = rows
            response.success()

    @task(3)
    def standings_and_detail(self):
        if not self.tournaments:
            return
        tournament_id = random.choice(self.tournaments)["id"]
        self.client.get(
            api_path(f"/games/tournaments/{tournament_id}/"),
            headers=self.headers,
            name="tournament_detail",
        )
        self.client.get(
            api_path(f"/games/tournaments/{tournament_id}/standings/"),
            headers=self.headers,
            name="tournament_standings",
        )

    @task(2)
    def register_random_tournament(self):
        if not self.tournaments:
            return
        candidates = [
            t for t in self.tournaments
            if t.get("status") in ("pending", "active") and not t.get("is_private")
        ]
        if not candidates:
            return
        tournament_id = random.choice(candidates)["id"]
        with self.client.post(
            api_path(f"/games/tournaments/{tournament_id}/register/"),
            headers=self.headers,
            json={},
            name="tournament_register",
            catch_response=True,
        ) as response:
            if response.status_code in (200, 400):
                response.success()
            else:
                response.failure(f"unexpected register status {response.status_code}")


class TournamentCreatorUser(HttpUser):
    wait_time = between(3, 6)
    weight = 1

    def on_start(self):
        self.headers = {}
        self.created_tournament_ids = []
        self._login_creator()

    def _login_creator(self):
        username = os.getenv("TOURNAMENT_LOAD_CREATOR_USERNAME", f"{USER_PREFIX}_creator")
        payload = {"username": username, "password": PASSWORD}
        with self.client.post(
            api_path("/accounts/login/"),
            json=payload,
            name="creator_login",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"creator login failed: {response.status_code}")
                return
            token = response.json().get("token")
            if not token:
                response.failure("creator token missing")
                return
            self.headers = {"Authorization": f"Token {token}"}
            response.success()

    @task(2)
    def create_tournament(self):
        ttype = random.choice(["arena", "swiss", "round_robin", "knockout"])
        start_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat()
        payload = {
            "name": f"locust-{ttype}-{random.randint(1000, 9999)}",
            "description": "locust tournament",
            "type": ttype,
            "time_control": "blitz",
            "initial_time_seconds": 120,
            "increment_seconds": 0,
            "start_at": start_at,
            "rated": False,
        }
        if ttype == "arena":
            payload["arena_duration_minutes"] = 10
        if ttype == "swiss":
            payload["swiss_rounds"] = 3

        with self.client.post(
            api_path("/games/tournaments/"),
            headers=self.headers,
            json=payload,
            name="tournament_create",
            catch_response=True,
        ) as response:
            if response.status_code != 201:
                response.failure(f"create failed: {response.status_code}")
                return
            tid = response.json().get("id")
            if tid:
                self.created_tournament_ids.append(tid)
            response.success()

    @task(1)
    def start_or_pair_created_tournaments(self):
        if not self.created_tournament_ids:
            return
        tournament_id = random.choice(self.created_tournament_ids)
        with self.client.post(
            api_path(f"/games/tournaments/{tournament_id}/start/"),
            headers=self.headers,
            json={},
            name="tournament_start",
            catch_response=True,
        ) as response:
            if response.status_code in (200, 400):
                response.success()
            else:
                response.failure(f"unexpected start status {response.status_code}")
        with self.client.post(
            api_path(f"/games/tournaments/{tournament_id}/pairings/"),
            headers=self.headers,
            json={},
            name="tournament_pairings",
            catch_response=True,
        ) as response:
            if response.status_code in (201, 202, 200, 400):
                response.success()
            else:
                response.failure(f"unexpected pairings status {response.status_code}")
