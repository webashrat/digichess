from django.urls import path

from games import consumers as game_consumers
from games import consumers_user

websocket_urlpatterns = [
    path("ws/game/<int:game_id>/", game_consumers.GameConsumer.as_asgi()),
    path("ws/spectate/<int:game_id>/", game_consumers.SpectateConsumer.as_asgi()),
    path("ws/user/<int:user_id>/", consumers_user.UserConsumer.as_asgi()),
]
