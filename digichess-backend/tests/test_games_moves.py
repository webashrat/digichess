import pytest
from datetime import timedelta
from django.utils import timezone

from games.models import Game
from games.tasks import check_first_move_timeouts


@pytest.mark.django_db
def test_first_move_deadlines_and_progression(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    accept_client, _ = auth_client(opponent)
    response = accept_client.post(f"/api/games/{game_data['id']}/accept/")
    assert response.status_code == 200

    white_client, _ = auth_client(challenger)
    detail = white_client.get(f"/api/games/{game_data['id']}/")
    assert detail.status_code == 200
    assert detail.data["first_move_color"] == "white"
    assert detail.data["first_move_deadline"] is not None

    move_response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "e4"}, format="json"
    )
    assert move_response.status_code == 200

    black_client, _ = auth_client(opponent)
    detail_black = black_client.get(f"/api/games/{game_data['id']}/")
    assert detail_black.status_code == 200
    assert detail_black.data["first_move_color"] == "black"
    assert detail_black.data["first_move_deadline"] is not None

    move_response_black = black_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "e5"}, format="json"
    )
    assert move_response_black.status_code == 200

    detail_after = white_client.get(f"/api/games/{game_data['id']}/")
    assert detail_after.status_code == 200
    assert detail_after.data["first_move_deadline"] is None


@pytest.mark.django_db
def test_illegal_move_rejected(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Qh5"}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_non_participant_cannot_move(create_game, auth_client, create_user):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    outsider = create_user(email="outsider@example.com", username="outsider")
    outsider_client, _ = auth_client(outsider)
    response = outsider_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "e4"}, format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_first_move_timeout_task_aborts_game(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.started_at = timezone.now() - timedelta(seconds=25)
    game.save(update_fields=["started_at"])

    check_first_move_timeouts()

    game.refresh_from_db()
    assert game.status == Game.STATUS_ABORTED


@pytest.mark.django_db
def test_black_first_move_timeout_after_white_moves(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    move_response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "e4"}, format="json"
    )
    assert move_response.status_code == 200

    game = Game.objects.get(id=game_data["id"])
    game.last_move_at = timezone.now() - timedelta(seconds=25)
    game.save(update_fields=["last_move_at"])

    check_first_move_timeouts()

    game.refresh_from_db()
    assert game.status == Game.STATUS_ABORTED
