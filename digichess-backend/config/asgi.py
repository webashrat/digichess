import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Initialize Django before importing anything that uses Django models
django.setup()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

from .routing import websocket_urlpatterns
from .middleware import TokenAuthMiddlewareStack

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": TokenAuthMiddlewareStack(AuthMiddlewareStack(URLRouter(websocket_urlpatterns))),
    }
)
