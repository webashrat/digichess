import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from games.consumers import GameConsumer
from games.models import Game


@pytest.mark.django_db(transaction=True)
def test_game_started_event_payload(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    channel_layer = get_channel_layer()
    channel = async_to_sync(channel_layer.new_channel)()
    async_to_sync(channel_layer.group_add)(f"user_{challenger.id}", channel)

    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    event = async_to_sync(channel_layer.receive)(channel)
    assert event["payload"]["type"] == "game_started"
    assert event["payload"]["game_id"] == game_data["id"]


@pytest.mark.django_db(transaction=True)
def test_game_finished_event_payload(create_game, auth_client):
    game_data, challenger, opponent = create_game()
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")

    channel_layer = get_channel_layer()
    channel = async_to_sync(channel_layer.new_channel)()
    async_to_sync(channel_layer.group_add)(f"game_{game_data['id']}", channel)

    auth_client(challenger)[0].post(f"/api/games/{game_data['id']}/resign/")

    payload_types = []
    for _ in range(2):
        event = async_to_sync(channel_layer.receive)(channel)
        payload_types.append(event["payload"].get("type"))
    assert "game_finished" in payload_types


@pytest.mark.django_db(transaction=True)
def test_chat_event_payload(create_game):
    game_data, challenger, opponent = create_game()
    game = Game.objects.get(id=game_data["id"])
    game.status = Game.STATUS_ACTIVE
    game.save(update_fields=["status"])

    channel_layer = get_channel_layer()
    channel = async_to_sync(channel_layer.new_channel)()

    scope = {
        "type": "websocket",
        "url_route": {"kwargs": {"game_id": game.id}},
        "user": challenger,
    }
    consumer = GameConsumer(scope)
    consumer.scope = scope
    consumer.channel_layer = channel_layer
    consumer.channel_name = "test_channel"
    consumer.game_id = game.id
    consumer.group_name = f"game_{game.id}"
    async_to_sync(channel_layer.group_add)(consumer.group_name, channel)

    async_to_sync(consumer._handle_chat_message)({"message": "hello", "room": "players"})
    event = async_to_sync(channel_layer.receive)(channel)
    assert event["payload"]["type"] == "chat"
    assert event["payload"]["message"] == "hello"
