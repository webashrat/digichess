import json

from channels.generic.websocket import AsyncWebsocketConsumer


class DigiQuizRoundConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.round_id = self.scope["url_route"]["kwargs"]["round_id"]
        self.group_name = f"digiquiz_round_{self.round_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name") and self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        return

    async def digiquiz_event(self, event):
        await self.send(text_data=json.dumps(event.get("payload", {})))
