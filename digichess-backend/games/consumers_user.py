import json
from channels.generic.websocket import AsyncWebsocketConsumer


class UserConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close()
            return
        
        self.user_id = self.scope["url_route"]["kwargs"]["user_id"]
        # Verify user can only connect to their own notification channel
        if user.id != self.user_id:
            await self.close()
            return
        
        self.group_name = f"user_{self.user_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add("mm_global", self.channel_name)
        await self.accept()

    async def disconnect(self, code):
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