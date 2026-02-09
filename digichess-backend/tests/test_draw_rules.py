import pytest
from datetime import timedelta
from django.utils import timezone

from games.game_core import _evaluate_result, build_board_from_moves, is_insufficient_material
from games.models import Game
from games.tasks import check_game_timeouts


@pytest.mark.django_db
def test_auto_stalemate_draw(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "7k/6Q1/6K1/8/8/8/8/8 w - - 0 1"
    game.moves = ""
    game.save(update_fields=["current_fen", "moves"])

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Qf7"}, format="json"
    )
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_auto_insufficient_material_draw_after_move(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "8/8/8/8/8/8/8/K1k5 w - - 0 1"
    game.moves = ""
    game.save(update_fields=["current_fen", "moves"])

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Ka2"}, format="json"
    )
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_auto_threefold_repetition_draw(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    black_client, _ = auth_client(opponent)

    moves = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]
    for idx, move in enumerate(moves):
        client = white_client if idx % 2 == 0 else black_client
        response = client.post(
            f"/api/games/{game_data['id']}/move/", {"move": move}, format="json"
        )
        assert response.status_code == 200

    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


def test_auto_fivefold_repetition_draw():
    moves = "Nf3 Nf6 Ng1 Ng8 " * 4
    board = build_board_from_moves(moves, Game.START_FEN)
    assert board is not None
    result, reason = _evaluate_result(board, moves, Game.START_FEN)
    assert result == Game.RESULT_DRAW
    assert reason == "fivefold_repetition"


@pytest.mark.django_db
def test_auto_fifty_move_draw(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "8/8/8/8/8/8/4K2R/6k1 w - - 99 50"
    game.moves = ""
    game.save(update_fields=["current_fen", "moves"])

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Rh3"}, format="json"
    )
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_auto_seventyfive_move_draw(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "8/8/8/8/8/8/4K2R/6k1 w - - 149 50"
    game.moves = ""
    game.save(update_fields=["current_fen", "moves"])

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Rh3"}, format="json"
    )
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_timeout_draw_on_insufficient_material_move_attempt(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.status = Game.STATUS_ACTIVE
    game.current_fen = "8/8/8/8/8/8/8/K1k5 w - - 0 1"
    game.moves = "e4 e5"
    game.white_time_left = 0
    game.black_time_left = 100
    game.last_move_at = timezone.now() - timedelta(seconds=10)
    game.save(update_fields=[
        "status",
        "current_fen",
        "moves",
        "white_time_left",
        "black_time_left",
        "last_move_at",
    ])

    white_client, _ = auth_client(challenger)
    response = white_client.post(
        f"/api/games/{game_data['id']}/move/", {"move": "Ka2"}, format="json"
    )
    assert response.status_code == 400

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_timeout_draw_on_insufficient_material_task(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.status = Game.STATUS_ACTIVE
    game.current_fen = "8/8/8/8/8/8/8/K1k5 w - - 0 1"
    game.moves = "e4 e5"
    game.white_time_left = 0
    game.black_time_left = 100
    game.last_move_at = timezone.now() - timedelta(seconds=10)
    game.save(update_fields=[
        "status",
        "current_fen",
        "moves",
        "white_time_left",
        "black_time_left",
        "last_move_at",
    ])

    check_game_timeouts()

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_resign_draw_on_insufficient_material(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "8/8/8/8/8/8/8/K1k5 w - - 0 1"
    game.moves = ""
    game.save(update_fields=["current_fen", "moves"])

    white_client, _ = auth_client(challenger)
    response = white_client.post(f"/api/games/{game_data['id']}/resign/", {}, format="json")
    assert response.status_code == 200

    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.parametrize(
    "fen",
    [
        "8/8/8/8/8/8/8/K1k5 w - - 0 1",
        "8/8/8/8/8/8/6N1/K1k5 w - - 0 1",
        "8/8/8/8/8/8/6B1/K1k5 w - - 0 1",
        "8/8/8/8/8/6N1/6N1/K1k5 w - - 0 1",
        "8/8/8/8/8/6N1/6N1/K1k3n1 w - - 0 1",
        "8/8/8/8/8/6N1/6N1/K1k3b1 w - - 0 1",
        "8/8/8/8/8/6B1/8/K1k3n1 w - - 0 1",
        "8/8/8/8/8/6B1/8/K1k2b2 w - - 0 1",
        "8/8/8/8/8/6N1/8/K1k3n1 w - - 0 1",
        "8/8/8/8/8/6N1/8/K1k2nn1 w - - 0 1",
    ],
)
def test_custom_insufficient_material_cases(fen):
    board = build_board_from_moves("", Game.START_FEN)
    assert board is not None
    board.set_fen(fen)
    assert is_insufficient_material(board)
