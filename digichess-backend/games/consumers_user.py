import json
from channels.generic.websocket import AsyncWebsocketConsumer


class UserConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.group_name = None
        self.user_id = None
    
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            import sys
            print(f"[UserConsumer] Connection rejected: user is anonymous or not authenticated", file=sys.stderr)
            await self.close()
            return
        
        try:
            self.user_id = int(self.scope["url_route"]["kwargs"]["user_id"])
        except (ValueError, KeyError, TypeError) as e:
            import sys
            print(f"[UserConsumer] Invalid user_id in URL: {e}", file=sys.stderr)
            await self.close()
            return
        
        # Verify user can only connect to their own notification channel
        if user.id != self.user_id:
            import sys
            print(f"[UserConsumer] User {user.id} attempted to connect to channel for user {self.user_id}", file=sys.stderr)
            await self.close()
            return
        
        try:
            self.group_name = f"user_{self.user_id}"
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.channel_layer.group_add("mm_global", self.channel_name)
            await self.accept()
            import sys
            print(f"[UserConsumer] User {user.id} ({user.username}) connected to notification channel", file=sys.stdout)
        except Exception as e:
            import sys
            print(f"[UserConsumer] Error during connection setup: {e}", file=sys.stderr)
            await self.close()

    async def disconnect(self, code):
        # Only discard from groups if we successfully connected
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_discard("mm_global", self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        pass

    async def game_event(self, event):
        await self.send(text_data=json.dumps(event.get("payload", {})))
    
    async def notification(self, event):
        """Handle notification events"""
        await self.send(text_data=json.dumps({
            "type": "notification",
            "notification": event.get("notification", {})
        }))