import pytest
from django.utils import timezone
from datetime import timedelta

from games.models import Game


@pytest.mark.django_db
def test_draw_offer_accept_flow(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    offer = white_client.post(f"/api/games/{game_data['id']}/offer-draw/", {}, format="json")
    assert offer.status_code == 200

    black_client, _ = auth_client(opponent)
    accept = black_client.post(
        f"/api/games/{game_data['id']}/respond-draw/",
        {"decision": "accept"},
        format="json",
    )
    assert accept.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_draw_offer_decline_flow(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    white_client.post(f"/api/games/{game_data['id']}/offer-draw/", {}, format="json")

    black_client, _ = auth_client(opponent)
    decline = black_client.post(
        f"/api/games/{game_data['id']}/respond-draw/",
        {"decision": "decline"},
        format="json",
    )
    assert decline.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_ACTIVE
    assert game.draw_offer_by is None


@pytest.mark.django_db
def test_draw_offer_cleared_on_opponent_move(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    black_client, _ = auth_client(opponent)

    move_response = white_client.post(
        f"/api/games/{game_data['id']}/move/",
        {"move": "e4"},
        format="json",
    )
    assert move_response.status_code == 200

    offer = white_client.post(f"/api/games/{game_data['id']}/offer-draw/", {}, format="json")
    assert offer.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.draw_offer_by == challenger

    black_move = black_client.post(
        f"/api/games/{game_data['id']}/move/",
        {"move": "e5"},
        format="json",
    )
    assert black_move.status_code == 200
    game.refresh_from_db()
    assert game.status == Game.STATUS_ACTIVE
    assert game.draw_offer_by is None


@pytest.mark.django_db
def test_draw_offer_response_requires_opponent(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    offer = white_client.post(f"/api/games/{game_data['id']}/offer-draw/", {}, format="json")
    assert offer.status_code == 200

    response = white_client.post(
        f"/api/games/{game_data['id']}/respond-draw/",
        {"decision": "accept"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_draw_offer_invalid_decision_returns_400(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    offer = white_client.post(f"/api/games/{game_data['id']}/offer-draw/", {}, format="json")
    assert offer.status_code == 200

    black_client, _ = auth_client(opponent)
    response = black_client.post(
        f"/api/games/{game_data['id']}/respond-draw/",
        {"decision": "maybe"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_claim_draw_insufficient_material(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    game = Game.objects.get(id=game_data["id"])
    game.current_fen = "8/8/8/8/8/8/8/K1k5 w - - 0 1"
    game.save(update_fields=["current_fen"])

    white_client, _ = auth_client(challenger)
    claim = white_client.post(f"/api/games/{game_data['id']}/claim-draw/", {}, format="json")
    assert claim.status_code == 200
    game.refresh_from_db()
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_DRAW


@pytest.mark.django_db
def test_resign_and_abort_flows(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")

    white_client, _ = auth_client(challenger)
    abort_pending = white_client.post(f"/api/games/{game_data['id']}/abort/", {}, format="json")
    assert abort_pending.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_ABORTED

    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    white_client, _ = auth_client(challenger)
    resign = white_client.post(f"/api/games/{game_data['id']}/resign/", {}, format="json")
    assert resign.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_FINISHED
    assert game.result == Game.RESULT_BLACK


@pytest.mark.django_db
def test_abort_after_too_many_moves_fails(create_game, auth_client):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    white_client, _ = auth_client(challenger)
    black_client, _ = auth_client(opponent)
    white_client.post(f"/api/games/{game_data['id']}/move/", {"move": "e4"}, format="json")
    black_client.post(f"/api/games/{game_data['id']}/move/", {"move": "e5"}, format="json")
    white_client.post(f"/api/games/{game_data['id']}/move/", {"move": "Nf3"}, format="json")

    abort = white_client.post(f"/api/games/{game_data['id']}/abort/", {}, format="json")
    assert abort.status_code == 400


@pytest.mark.django_db
def test_rematch_request_accept_reject(auth_client, create_user):
    white = create_user(email="rwhite@example.com", username="rwhite")
    black = create_user(email="rblack@example.com", username="rblack")
    game = Game.objects.create(
        creator=white,
        white=white,
        black=black,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_WHITE,
        finished_at=timezone.now(),
    )

    white_client, _ = auth_client(white)
    rematch_request = white_client.post(f"/api/games/{game.id}/rematch/", {}, format="json")
    assert rematch_request.status_code == 200
    game.refresh_from_db()
    assert game.rematch_requested_by == white

    black_client, _ = auth_client(black)
    rematch_accept = black_client.post(f"/api/games/{game.id}/rematch/accept/", {}, format="json")
    assert rematch_accept.status_code == 201
    rematch_game_id = rematch_accept.data["id"]
    rematch_game = Game.objects.get(id=rematch_game_id)
    assert rematch_game.rematch_of_id == game.id

    game.rematch_requested_by = white
    game.save(update_fields=["rematch_requested_by"])
    rematch_reject = black_client.post(f"/api/games/{game.id}/rematch/reject/", {}, format="json")
    assert rematch_reject.status_code == 200
    game.refresh_from_db()
    assert game.rematch_requested_by is None
