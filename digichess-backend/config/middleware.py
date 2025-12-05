from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_key):
    """Get user from token key"""
    try:
        token = Token.objects.select_related('user').get(key=token_key)
        return token.user
    except Token.DoesNotExist:
        return None


class TokenAuthMiddleware(BaseMiddleware):
    """
    Token authentication middleware for WebSocket connections.
    Checks for token in query string or headers.
    This runs BEFORE AuthMiddlewareStack, so if we set a user, AuthMiddlewareStack will use it.
    """
    
    async def __call__(self, scope, receive, send):
        # Only process WebSocket connections
        if scope["type"] != "websocket":
            return await super().__call__(scope, receive, send)
        
        try:
            # Extract token from query string
            query_string = scope.get("query_string", b"").decode()
            query_params = parse_qs(query_string)
            token_key = None
            
            # Check query string for token
            if "token" in query_params:
                token_key = query_params["token"][0]
                import sys
                print(f"[TokenAuth] Found token in query string for WebSocket", file=sys.stdout)
            
            # If no token in query string, check headers
            if not token_key:
                headers = dict(scope.get("headers", []))
                auth_header = headers.get(b"authorization", b"").decode()
                if auth_header.startswith("Token "):
                    token_key = auth_header.replace("Token ", "").strip()
                    import sys
                    print(f"[TokenAuth] Found token in Authorization header for WebSocket", file=sys.stdout)
            
            # Authenticate user if token is provided
            # Only set user if we have a valid token - AuthMiddlewareStack will handle AnonymousUser
            if token_key:
                user = await get_user_from_token(token_key)
                if user:
                    scope["user"] = user
                    import sys
                    print(f"[TokenAuth] Authenticated user {user.username} (ID: {user.id}) for WebSocket", file=sys.stdout)
                else:
                    import sys
                    print(f"[TokenAuth] Invalid token for WebSocket", file=sys.stderr)
            else:
                import sys
                print(f"[TokenAuth] No token provided for WebSocket connection", file=sys.stdout)
        except Exception as e:
            # Log error but don't fail the connection - let AuthMiddlewareStack handle it
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Token auth middleware error: {e}")
        
        return await super().__call__(scope, receive, send)


def TokenAuthMiddlewareStack(inner):
    """Stack token auth middleware with other middleware"""
    return TokenAuthMiddleware(inner)

