import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

from .models import Game
from .serializers import GameSerializer

User = get_user_model()


class BaseGameConsumer(AsyncWebsocketConsumer):
    group_name = None

    async def connect(self):
        self.game_id = self.scope["url_route"]["kwargs"]["game_id"]
        self.group_name = f"game_{self.game_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        """Handle incoming WebSocket messages"""
        if not text_data:
            return
        
        try:
            data = json.loads(text_data)
            message_type = data.get("type")
            
            if message_type == "chat":
                await self._handle_chat_message(data)
        except (json.JSONDecodeError, KeyError) as e:
            # Invalid message format, ignore
            pass

    async def _handle_chat_message(self, data):
        """Handle chat message from client"""
        import sys
        user = self.scope.get("user")
        
        # Log authentication status
        print(f"[GameChat] Received chat message for game {self.game_id}, user: {user}, is_anonymous: {getattr(user, 'is_anonymous', True) if user else 'None'}", file=sys.stdout)
        
        # Check if user is authenticated (not anonymous)
        if not user or user.is_anonymous:
            print(f"[GameChat] User not authenticated, ignoring chat message", file=sys.stderr)
            return
        
        if not hasattr(user, 'id'):
            print(f"[GameChat] User object missing id attribute, ignoring chat message", file=sys.stderr)
            return
        
        message = data.get("message", "").strip()
        if not message:
            print(f"[GameChat] Empty message, ignoring", file=sys.stdout)
            return
            
        if len(message) > 140:
            print(f"[GameChat] Message too long ({len(message)} chars), ignoring", file=sys.stdout)
            return
        
        # Verify user is part of this game (player or spectator)
        game = await self._get_game(self.game_id)
        if not game:
            print(f"[GameChat] Game {self.game_id} not found", file=sys.stderr)
            return
        
        is_player = (game.white_id == user.id or game.black_id == user.id)
        is_spectator = game.status == Game.STATUS_ACTIVE  # Allow spectators for active games
        
        print(f"[GameChat] User {user.username} (ID: {user.id}), is_player: {is_player}, is_spectator: {is_spectator}, game_status: {game.status}", file=sys.stdout)
        
        if not (is_player or is_spectator):
            print(f"[GameChat] User {user.username} not authorized to chat in game {self.game_id}", file=sys.stderr)
            return
        
        # Broadcast chat message to all connected clients
        chat_payload = {
            "type": "chat",
            "user": user.username or f"User {user.id}",
            "user_id": user.id,
            "message": message,
        }
        print(f"[GameChat] Broadcasting chat message: {chat_payload}", file=sys.stdout)
        
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "game.event",
                "payload": chat_payload,
            },
        )

    async def game_event(self, event):
        # Send the payload directly (not wrapped)
        payload = event.get("payload", {})
        await self.send(text_data=json.dumps(payload))

    @database_sync_to_async
    def _serialize_game(self, game_id):
        try:
            game = Game.objects.get(id=game_id)
            return GameSerializer(game).data
        except Game.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_game(self, game_id):
        """Get game object"""
        try:
            return Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return None


class GameConsumer(BaseGameConsumer):
    async def connect(self):
        await super().connect()
        # Send full game state immediately (like Lichess gameFull)
        data = await self._serialize_game(self.game_id)
        if data:
            # Get enhanced game state with legal moves and board state
            from games.lichess_game_flow import get_game_state_export
            game = await self._get_game(self.game_id)
            if game:
                game_state = await database_sync_to_async(get_game_state_export)(
                    game.current_fen or "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    game.moves or "",
                    "standard"
                )
                if game_state:
                    data.update({
                        "game_state": game_state,
                        "legal_moves": game_state.get("legal_moves", {}).get("san", [])
                    })
            
            await self.send(text_data=json.dumps({
                "type": "gameFull",  # Lichess-compatible type
                "game": data,
                "sync": True
            }))


class SpectateConsumer(BaseGameConsumer):
    async def connect(self):
        await super().connect()
        # Send full game state immediately (like Lichess gameFull)
        data = await self._serialize_game(self.game_id)
        if data:
            # Get enhanced game state with legal moves and board state
            from games.lichess_game_flow import get_game_state_export
            game = await self._get_game(self.game_id)
            if game:
                game_state = await database_sync_to_async(get_game_state_export)(
                    game.current_fen or "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    game.moves or "",
                    "standard"
                )
                if game_state:
                    data.update({
                        "game_state": game_state,
                        "legal_moves": game_state.get("legal_moves", {}).get("san", [])
                    })
            
            await self.send(text_data=json.dumps({
                "type": "gameFull",  # Lichess-compatible type
                "game": data,
                "sync": True
            }))
