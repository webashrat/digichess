import pytest
from datetime import timedelta
from django.utils import timezone

from games.models import Game
from games.tasks import check_game_timeouts


@pytest.mark.django_db
def test_rematch_request_sets_timestamp(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    response = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.rematch_requested_by == challenger
    assert game.rematch_requested_at is not None


@pytest.mark.django_db
def test_rematch_request_requires_finished_game(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    response = white_client.post(f"/api/games/{game_data['id']}/rematch/", {}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_rematch_request_same_user_twice_fails(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    response = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert response.status_code == 200

    second = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert second.status_code == 400
    game.refresh_from_db()
    assert game.rematch_requested_by == challenger


@pytest.mark.django_db
def test_rematch_accept_creates_swapped_game(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white", rated=False)
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    original = Game.objects.get(id=game_data["id"])
    original.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{original.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    black_client, _ = auth_client(opponent)
    accept = black_client.post(f"/api/games/{original.id}/rematch/accept/", {}, format="json")
    assert accept.status_code == 201

    rematch_game = Game.objects.get(id=accept.data["id"])
    assert rematch_game.rematch_of_id == original.id
    assert rematch_game.white_id == original.black_id
    assert rematch_game.black_id == original.white_id
    assert rematch_game.time_control == original.time_control
    assert rematch_game.rated == original.rated
    assert rematch_game.initial_time_seconds == original.initial_time_seconds
    assert rematch_game.increment_seconds == original.increment_seconds
    assert rematch_game.white_time_seconds == original.white_time_seconds
    assert rematch_game.black_time_seconds == original.black_time_seconds
    assert rematch_game.white_time_left == original.white_time_seconds
    assert rematch_game.black_time_left == original.black_time_seconds

    original.refresh_from_db()
    assert original.rematch_requested_by is None
    assert original.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_preserves_custom_time_settings(create_game, auth_client):
    game_data, challenger, opponent = create_game(
        preferred_color="white",
        time_control="blitz",
        initial_time_seconds=180,
        increment_seconds=2,
    )
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    original = Game.objects.get(id=game_data["id"])
    original.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{original.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    black_client, _ = auth_client(opponent)
    accept = black_client.post(f"/api/games/{original.id}/rematch/accept/", {}, format="json")
    assert accept.status_code == 201

    rematch_game = Game.objects.get(id=accept.data["id"])
    assert rematch_game.initial_time_seconds == 180
    assert rematch_game.increment_seconds == 2
    assert rematch_game.white_time_seconds == 180
    assert rematch_game.black_time_seconds == 180
    assert rematch_game.white_increment_seconds == 2
    assert rematch_game.black_increment_seconds == 2


@pytest.mark.django_db
def test_rematch_reject_clears_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    black_client, _ = auth_client(opponent)
    reject = black_client.post(f"/api/games/{game.id}/rematch/reject/", {}, format="json")
    assert reject.status_code == 200

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_accept_requires_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    black_client, _ = auth_client(opponent)
    accept = black_client.post(f"/api/games/{game.id}/rematch/accept/", {}, format="json")
    assert accept.status_code == 400


@pytest.mark.django_db
def test_rematch_accept_cannot_be_requester(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    accept = white_client.post(f"/api/games/{game.id}/rematch/accept/", {}, format="json")
    assert accept.status_code == 400


@pytest.mark.django_db
def test_rematch_reject_requires_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    black_client, _ = auth_client(opponent)
    reject = black_client.post(f"/api/games/{game.id}/rematch/reject/", {}, format="json")
    assert reject.status_code == 400


@pytest.mark.django_db
def test_rematch_post_by_opponent_accepts(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    black_client, _ = auth_client(opponent)
    accept = black_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert accept.status_code == 201

    rematch_game = Game.objects.get(id=accept.data["id"])
    assert rematch_game.rematch_of_id == game.id


@pytest.mark.django_db
def test_rematch_bot_auto_accepts(create_user, auth_client):
    human = create_user(email="human@example.com", username="human1")
    bot = create_user(email="bot@example.com", username="bot1", is_bot=True)
    game = Game.objects.create(
        creator=human,
        white=human,
        black=bot,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_DRAW,
        finished_at=timezone.now(),
    )

    human_client, _ = auth_client(human)
    response = human_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert response.status_code == 201


@pytest.mark.django_db
def test_rematch_expired_clears_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    game.rematch_requested_by = challenger
    game.rematch_requested_at = timezone.now() - timedelta(minutes=6)
    game.save(update_fields=["rematch_requested_by", "rematch_requested_at"])

    check_game_timeouts()

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_cancelled_on_active_conflict_task(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    game.rematch_requested_by = challenger
    game.rematch_requested_at = timezone.now()
    game.save(update_fields=["rematch_requested_by", "rematch_requested_at"])

    active_game = Game.objects.create(
        creator=challenger,
        white=challenger,
        black=opponent,
        status=Game.STATUS_ACTIVE,
        moves="",
        current_fen=Game.START_FEN,
    )
    assert active_game.status == Game.STATUS_ACTIVE

    check_game_timeouts()

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_accept_conflict_cancels_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    game.rematch_requested_by = challenger
    game.rematch_requested_at = timezone.now()
    game.save(update_fields=["rematch_requested_by", "rematch_requested_at"])

    Game.objects.create(
        creator=challenger,
        white=challenger,
        black=opponent,
        status=Game.STATUS_ACTIVE,
        moves="",
        current_fen=Game.START_FEN,
    )

    black_client, _ = auth_client(opponent)
    response = black_client.post(f"/api/games/{game.id}/rematch/accept/", {}, format="json")
    assert response.status_code == 400

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_cancel_clears_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    cancel = white_client.post(f"/api/games/{game.id}/rematch/cancel/", {}, format="json")
    assert cancel.status_code == 200

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None


@pytest.mark.django_db
def test_rematch_cancel_requires_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    cancel = white_client.post(f"/api/games/{game.id}/rematch/cancel/", {}, format="json")
    assert cancel.status_code == 400


@pytest.mark.django_db
def test_rematch_cancel_only_requester(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    white_client, _ = auth_client(challenger)
    request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert request.status_code == 200

    black_client, _ = auth_client(opponent)
    cancel = black_client.post(f"/api/games/{game.id}/rematch/cancel/", {}, format="json")
    assert cancel.status_code == 400

    game.refresh_from_db()
    assert game.rematch_requested_by == challenger
    assert game.rematch_requested_at is not None


@pytest.mark.django_db
def test_rematch_cancel_requires_finished_game(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    white_client, _ = auth_client(challenger)

    cancel = white_client.post(f"/api/games/{game_data['id']}/rematch/cancel/", {}, format="json")
    assert cancel.status_code == 400


@pytest.mark.django_db
def test_rematch_cancel_expired_window_clears_request(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)
    game.rematch_requested_by = challenger
    game.rematch_requested_at = timezone.now() - timedelta(minutes=11)
    game.finished_at = timezone.now() - timedelta(minutes=11)
    game.save(update_fields=["rematch_requested_by", "rematch_requested_at", "finished_at"])

    white_client, _ = auth_client(challenger)
    cancel = white_client.post(f"/api/games/{game.id}/rematch/cancel/", {}, format="json")
    assert cancel.status_code == 400

    game.refresh_from_db()
    assert game.rematch_requested_by is None
    assert game.rematch_requested_at is None
