import pytest
from django.utils import timezone
from datetime import timedelta

from games.models import Game
from games.tasks import check_pending_challenge_expiry
from notifications.models import Notification
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


@pytest.mark.django_db
def test_create_challenge_creates_notification_for_opponent(create_game):
    game_data, challenger, opponent = create_game()
    assert game_data["status"] == Game.STATUS_PENDING
    assert Notification.objects.filter(user=opponent, notification_type="game_challenge").exists()
    assert not Notification.objects.filter(user=challenger, notification_type="game_challenge").exists()


@pytest.mark.django_db
def test_accept_challenge_starts_game(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    client, _ = auth_client(opponent)
    response = client.post(f"/api/games/{game_data['id']}/accept/")
    assert response.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_ACTIVE
    assert game.started_at is not None


@pytest.mark.django_db
def test_reject_challenge_aborts_and_notifies(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    client, _ = auth_client(opponent)
    response = client.post(f"/api/games/{game_data['id']}/reject/")
    assert response.status_code == 200
    game = Game.objects.get(id=game_data["id"])
    assert game.status == Game.STATUS_ABORTED
    assert Notification.objects.filter(
        user=challenger, notification_type="challenge_rejected"
    ).exists()


@pytest.mark.django_db
def test_challenge_expired_task_notifies_both(create_game):
    game_data, challenger, opponent = create_game()
    game = Game.objects.get(id=game_data["id"])
    game.created_at = timezone.now() - timedelta(minutes=11)
    game.save(update_fields=["created_at"])

    check_pending_challenge_expiry()

    game.refresh_from_db()
    assert game.status == Game.STATUS_ABORTED
    assert Notification.objects.filter(user=challenger, notification_type="challenge_expired").exists()
    assert Notification.objects.filter(user=opponent, notification_type="challenge_expired").exists()


@pytest.mark.django_db
def test_accept_reject_challenge_before_expiry(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    game = Game.objects.get(id=game_data["id"])
    game.created_at = timezone.now() - timedelta(minutes=9, seconds=50)
    game.save(update_fields=["created_at"])

    client, _ = auth_client(opponent)
    response = client.post(f"/api/games/{game_data['id']}/accept/")
    assert response.status_code == 200
    game.refresh_from_db()
    assert game.status == Game.STATUS_ACTIVE


@pytest.mark.django_db
def test_accept_after_expiry_sends_game_finished_event(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    game = Game.objects.get(id=game_data["id"])
    game.created_at = timezone.now() - timedelta(minutes=11)
    game.save(update_fields=["created_at"])

    channel_layer = get_channel_layer()
    channel = async_to_sync(channel_layer.new_channel)()
    async_to_sync(channel_layer.group_add)(f"game_{game.id}", channel)

    client, _ = auth_client(opponent)
    response = client.post(f"/api/games/{game_data['id']}/accept/")
    assert response.status_code == 400
    game.refresh_from_db()
    assert game.status == Game.STATUS_ABORTED
    assert Notification.objects.filter(user=challenger, notification_type="challenge_expired").exists()
    assert Notification.objects.filter(user=opponent, notification_type="challenge_expired").exists()

    event = async_to_sync(channel_layer.receive)(channel)
    assert event["payload"]["type"] == "game_finished"
    assert event["payload"]["reason"] == "challenge_expired"
