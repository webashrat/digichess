"""
Tests for game chat isolation between players and spectators.

Verifies:
 - Players can send messages in the "players" room.
 - Spectators can send messages in the "spectators" room.
 - A spectator CANNOT send a message in the "players" room.
 - A player CANNOT send a message in the "spectators" room.
 - An unauthenticated user cannot send any chat messages.
 - Messages longer than 140 characters are rejected.
 - Empty / whitespace-only messages are rejected.
 - Chat only works on active games (not pending / finished).
 - Both players in a game can independently send player-room chat.
 - The broadcast payload contains the correct room tag so the
   frontend can filter display correctly.
"""

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from games.consumers import GameConsumer, SpectateConsumer
from games.models import Game


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_consumer(consumer_cls, game, user):
    """Build a consumer instance wired to the in-memory channel layer."""
    channel_layer = get_channel_layer()
    scope = {
        "type": "websocket",
        "url_route": {"kwargs": {"game_id": game.id}},
        "user": user,
    }
    consumer = consumer_cls(scope)
    consumer.scope = scope
    consumer.channel_layer = channel_layer
    consumer.channel_name = async_to_sync(channel_layer.new_channel)()
    consumer.game_id = game.id
    consumer.group_name = f"game_{game.id}"
    async_to_sync(channel_layer.group_add)(consumer.group_name, consumer.channel_name)
    return consumer, consumer.channel_name


def _receive_event(channel_name, timeout=1):
    """Pull the next event off a channel (blocking, short timeout)."""
    channel_layer = get_channel_layer()
    return async_to_sync(channel_layer.receive)(channel_name)


def _drain_events(channel_name, max_events=10):
    """Collect all pending events (non-blocking) and return them."""
    from channels.exceptions import ChannelFull
    events = []
    channel_layer = get_channel_layer()
    for _ in range(max_events):
        try:
            event = async_to_sync(channel_layer.receive)(channel_name)
            events.append(event)
        except Exception:
            break
    return events


def _activate_game(game):
    """Move a game to active status so chat is allowed."""
    game.status = Game.STATUS_ACTIVE
    game.save(update_fields=["status"])


# ---------------------------------------------------------------------------
# Player chat tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestPlayerChat:
    """Player-room chat: only white/black can send to 'players' room."""

    def test_white_can_send_player_chat(self, create_game):
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, white)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "good luck!", "room": "players"}
        )

        event = _receive_event(channel)
        payload = event["payload"]
        assert payload["type"] == "chat"
        assert payload["room"] == "players"
        assert payload["message"] == "good luck!"
        assert payload["user"] == white.username
        assert payload["user_id"] == white.id

    def test_black_can_send_player_chat(self, create_game):
        game_data, _white, black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, black)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "you too!", "room": "players"}
        )

        event = _receive_event(channel)
        assert event["payload"]["type"] == "chat"
        assert event["payload"]["room"] == "players"
        assert event["payload"]["user"] == black.username

    def test_both_players_receive_same_broadcast(self, create_game):
        """When white sends a message, both white and black channels get it."""
        game_data, white, black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        white_consumer, white_ch = _make_consumer(GameConsumer, game, white)
        _black_consumer, black_ch = _make_consumer(GameConsumer, game, black)

        async_to_sync(white_consumer._handle_chat_message)(
            {"message": "e4", "room": "players"}
        )

        white_event = _receive_event(white_ch)
        black_event = _receive_event(black_ch)

        assert white_event["payload"]["message"] == "e4"
        assert black_event["payload"]["message"] == "e4"
        assert white_event["payload"]["room"] == "players"
        assert black_event["payload"]["room"] == "players"

    def test_default_room_is_players(self, create_game):
        """Omitting 'room' should default to 'players'."""
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, white)
        async_to_sync(consumer._handle_chat_message)({"message": "hi"})

        event = _receive_event(channel)
        assert event["payload"]["room"] == "players"


# ---------------------------------------------------------------------------
# Spectator chat tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestSpectatorChat:
    """Spectators-room chat: only non-players can send to 'spectators' room."""

    def test_spectator_can_send_spectator_chat(self, create_game, create_user):
        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        spectator = create_user()
        consumer, channel = _make_consumer(SpectateConsumer, game, spectator)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "nice move!", "room": "spectators"}
        )

        event = _receive_event(channel)
        payload = event["payload"]
        assert payload["type"] == "chat"
        assert payload["room"] == "spectators"
        assert payload["message"] == "nice move!"
        assert payload["user"] == spectator.username

    def test_multiple_spectators_receive_broadcast(self, create_game, create_user):
        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        spectator1 = create_user()
        spectator2 = create_user()

        s1_consumer, s1_ch = _make_consumer(SpectateConsumer, game, spectator1)
        _s2_consumer, s2_ch = _make_consumer(SpectateConsumer, game, spectator2)

        async_to_sync(s1_consumer._handle_chat_message)(
            {"message": "wow!", "room": "spectators"}
        )

        s1_event = _receive_event(s1_ch)
        s2_event = _receive_event(s2_ch)

        assert s1_event["payload"]["message"] == "wow!"
        assert s2_event["payload"]["message"] == "wow!"
        assert s1_event["payload"]["room"] == "spectators"
        assert s2_event["payload"]["room"] == "spectators"


# ---------------------------------------------------------------------------
# Cross-room isolation tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestChatIsolation:
    """Players and spectators must NOT be able to post in each other's rooms."""

    def test_spectator_cannot_send_player_chat(self, create_game, create_user):
        """A spectator trying to send to 'players' room should be rejected."""
        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        spectator = create_user()
        consumer, channel = _make_consumer(SpectateConsumer, game, spectator)

        # Subscribe a listener on the group to detect any broadcast
        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        async_to_sync(consumer._handle_chat_message)(
            {"message": "sneaky!", "room": "players"}
        )

        # The spectator message should NOT have been broadcast at all.
        # InMemoryChannelLayer doesn't support timeout, so we send a
        # sentinel from a valid player to flush the queue.
        _white_consumer, _ = _make_consumer(GameConsumer, game, _white)
        async_to_sync(_white_consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__", (
            "Spectator message should have been blocked; first event must be the sentinel"
        )

    def test_player_cannot_send_spectator_chat(self, create_game):
        """A player trying to send to 'spectators' room should be rejected."""
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, white)

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        async_to_sync(consumer._handle_chat_message)(
            {"message": "i'm a player in spectators!", "room": "spectators"}
        )

        # Flush with a valid player-room message
        async_to_sync(consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__", (
            "Player's spectator-room message should have been blocked"
        )

    def test_spectator_does_not_see_player_chat_in_spectator_room(
        self, create_game, create_user
    ):
        """
        Player chat is broadcast to the group (both players and spectators
        receive the raw WebSocket frame), but the payload carries
        room='players' so the frontend ONLY renders it in the players tab.
        This test verifies the room tag is correct on the payload.
        """
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        spectator = create_user()
        _spec_consumer, spec_ch = _make_consumer(SpectateConsumer, game, spectator)

        player_consumer, _player_ch = _make_consumer(GameConsumer, game, white)
        async_to_sync(player_consumer._handle_chat_message)(
            {"message": "secret plan", "room": "players"}
        )

        # Spectator's channel WILL receive the event (same group), but the
        # room tag must be "players" so the frontend filters it out.
        event = _receive_event(spec_ch)
        assert event["payload"]["room"] == "players", (
            "Player chat must be tagged room='players' so frontend hides it from spectators"
        )

    def test_player_does_not_see_spectator_chat_in_player_room(
        self, create_game, create_user
    ):
        """Symmetric check: spectator chat is tagged room='spectators'."""
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        spectator = create_user()
        spec_consumer, _spec_ch = _make_consumer(SpectateConsumer, game, spectator)
        _player_consumer, player_ch = _make_consumer(GameConsumer, game, white)

        async_to_sync(spec_consumer._handle_chat_message)(
            {"message": "go white!", "room": "spectators"}
        )

        event = _receive_event(player_ch)
        assert event["payload"]["room"] == "spectators", (
            "Spectator chat must be tagged room='spectators' so frontend hides it from players"
        )


# ---------------------------------------------------------------------------
# Authentication & validation tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestChatValidation:
    """Edge cases: auth, message length, game status."""

    def test_anonymous_user_cannot_chat(self, create_game):
        from django.contrib.auth.models import AnonymousUser

        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        anon = AnonymousUser()
        consumer, _ = _make_consumer(GameConsumer, game, anon)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "hello", "room": "players"}
        )

        # Flush with a valid message to prove anonymous was dropped
        valid_consumer, _ = _make_consumer(GameConsumer, game, _white)
        async_to_sync(valid_consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__"

    def test_empty_message_rejected(self, create_game):
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        consumer, _ = _make_consumer(GameConsumer, game, white)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "   ", "room": "players"}
        )

        async_to_sync(consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__"

    def test_message_over_140_chars_rejected(self, create_game):
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        consumer, _ = _make_consumer(GameConsumer, game, white)
        long_msg = "x" * 141
        async_to_sync(consumer._handle_chat_message)(
            {"message": long_msg, "room": "players"}
        )

        async_to_sync(consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__"

    def test_message_exactly_140_chars_accepted(self, create_game):
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, white)
        msg = "a" * 140
        async_to_sync(consumer._handle_chat_message)(
            {"message": msg, "room": "players"}
        )

        event = _receive_event(channel)
        assert event["payload"]["message"] == msg

    def test_chat_blocked_on_pending_game(self, create_game, create_user):
        """Chat should not work for spectators on a pending game."""
        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        assert game.status == Game.STATUS_PENDING

        spectator = create_user()

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        consumer, _ = _make_consumer(SpectateConsumer, game, spectator)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "too early", "room": "spectators"}
        )

        # Activate and send sentinel to prove the earlier message was dropped
        _activate_game(game)
        valid_consumer, _ = _make_consumer(GameConsumer, game, _white)
        async_to_sync(valid_consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__"

    def test_invalid_room_falls_back_to_players(self, create_game):
        """An unrecognised room value should be treated as 'players'."""
        game_data, white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        _activate_game(game)

        consumer, channel = _make_consumer(GameConsumer, game, white)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "fallback", "room": "invalid_room"}
        )

        event = _receive_event(channel)
        assert event["payload"]["room"] == "players"

    def test_non_participant_cannot_chat(self, create_game, create_user):
        """
        A random user who is neither a player nor a spectator of a
        non-active game should be rejected.
        """
        game_data, _white, _black = create_game()
        game = Game.objects.get(id=game_data["id"])
        # Keep game pending -- outsider is not a player and is_spectator
        # requires STATUS_ACTIVE
        assert game.status == Game.STATUS_PENDING

        outsider = create_user()

        channel_layer = get_channel_layer()
        listener = async_to_sync(channel_layer.new_channel)()
        async_to_sync(channel_layer.group_add)(f"game_{game.id}", listener)

        consumer, _ = _make_consumer(GameConsumer, game, outsider)
        async_to_sync(consumer._handle_chat_message)(
            {"message": "hack", "room": "players"}
        )

        _activate_game(game)
        valid_consumer, _ = _make_consumer(GameConsumer, game, _white)
        async_to_sync(valid_consumer._handle_chat_message)(
            {"message": "__sentinel__", "room": "players"}
        )

        event = _receive_event(listener)
        assert event["payload"]["message"] == "__sentinel__"
