import pytest

from games.models import Game
from games import views_matchmaking


class FakeRedis:
    def __init__(self):
        self.zsets = {}
        self.hashes = {}

    def zadd(self, key, mapping):
        zset = self.zsets.setdefault(key, {})
        for member, score in mapping.items():
            zset[str(member)] = float(score)

    def zrangebyscore(self, key, low, high, start=0, num=None):
        zset = self.zsets.get(key, {})
        items = [(m, s) for m, s in zset.items() if low <= s <= high]
        items.sort(key=lambda item: item[1])
        members = [m for m, _ in items]
        if num is None:
            return members[start:]
        return members[start:start + num]

    def zrem(self, key, member):
        zset = self.zsets.get(key, {})
        zset.pop(str(member), None)

    def zrange(self, key, start, end, withscores=False):
        zset = self.zsets.get(key, {})
        items = sorted(zset.items(), key=lambda item: item[1])
        if end == -1:
            slice_items = items[start:]
        else:
            slice_items = items[start:end + 1]
        if withscores:
            return [(m, s) for m, s in slice_items]
        return [m for m, _ in slice_items]

    def zcard(self, key):
        return len(self.zsets.get(key, {}))

    def hset(self, key, field, value):
        h = self.hashes.setdefault(key, {})
        h[str(field)] = value

    def hdel(self, key, field):
        h = self.hashes.get(key, {})
        h.pop(str(field), None)


@pytest.mark.django_db
def test_matchmaking_enqueue_status_cancel(auth_client, create_user, monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(views_matchmaking, "get_redis", lambda: fake)

    user = create_user(email="mm1@example.com", username="mm1")
    client, _ = auth_client(user)
    resp = client.post("/api/games/matchmaking/enqueue/", {"time_control": "blitz"}, format="json")
    assert resp.status_code == 200

    status = client.get("/api/games/matchmaking/status/")
    assert status.status_code == 200
    assert status.data["queues"].get("blitz") == 1
    assert status.data["pool_sizes"].get("blitz") == 1

    cancel = client.post("/api/games/matchmaking/cancel/", {"time_control": "blitz"}, format="json")
    assert cancel.status_code == 200
    status_after = client.get("/api/games/matchmaking/status/")
    assert status_after.data["queues"].get("blitz") is None
    assert status_after.data["pool_sizes"].get("blitz") == 0


@pytest.mark.django_db
def test_matchmaking_match_found(auth_client, create_user, monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(views_matchmaking, "get_redis", lambda: fake)

    user1 = create_user(email="mm2@example.com", username="mm2")
    user2 = create_user(email="mm3@example.com", username="mm3")
    client1, _ = auth_client(user1)
    client2, _ = auth_client(user2)

    resp1 = client1.post("/api/games/matchmaking/enqueue/", {"time_control": "blitz"}, format="json")
    assert resp1.status_code == 200

    resp2 = client2.post("/api/games/matchmaking/enqueue/", {"time_control": "blitz"}, format="json")
    assert resp2.status_code == 201
    game_id = resp2.data["id"]

    game = Game.objects.get(id=game_id)
    assert game.status == Game.STATUS_PENDING
    assert fake.zcard("mm:blitz:z") == 0


@pytest.mark.django_db
def test_matchmaking_preset_queue_uses_exact_clock(auth_client, create_user, monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(views_matchmaking, "get_redis", lambda: fake)

    user1 = create_user(email="mm4@example.com", username="mm4")
    user2 = create_user(email="mm5@example.com", username="mm5")
    client1, _ = auth_client(user1)
    client2, _ = auth_client(user2)

    resp1 = client1.post("/api/games/matchmaking/enqueue/", {"queue_key": "blitz_5_3"}, format="json")
    assert resp1.status_code == 200

    status = client1.get("/api/games/matchmaking/status/")
    assert status.status_code == 200
    assert status.data["queues"].get("blitz_5_3") == 1
    assert status.data["pool_sizes"].get("blitz_5_3") == 1

    resp2 = client2.post("/api/games/matchmaking/enqueue/", {"queue_key": "blitz_5_3"}, format="json")
    assert resp2.status_code == 201

    game = Game.objects.get(id=resp2.data["id"])
    assert game.time_control == Game.TIME_BLITZ
    assert game.initial_time_seconds == 300
    assert game.increment_seconds == 3
    assert game.white_time_seconds == 300
    assert game.black_time_seconds == 300
    assert game.white_increment_seconds == 3
    assert game.black_increment_seconds == 3
    assert fake.zcard("mm:blitz_5_3:z") == 0
