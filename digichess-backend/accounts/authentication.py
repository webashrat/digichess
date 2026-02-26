from django.contrib.auth import get_user_model
from jwt import ExpiredSignatureError, InvalidTokenError
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed

from .auth_tokens import decode_access_token


User = get_user_model()


class JWTOrTokenAuthentication(BaseAuthentication):
    """
    Supports:
    - Authorization: Bearer <access_jwt>
    - Authorization: Token <access_jwt or legacy drf token>
    """

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if len(auth) != 2:
            raise AuthenticationFailed("Invalid authorization header format.")

        scheme = auth[0].decode("utf-8").lower()
        credential = auth[1].decode("utf-8")

        if scheme not in {"bearer", "token"}:
            return None

        if scheme == "token" and credential.count(".") != 2:
            user = self._authenticate_legacy_token(credential)
            if user is not None:
                return (user, None)

        user = self._authenticate_access_jwt(credential)
        return (user, None)

    def _authenticate_legacy_token(self, key: str):
        try:
            token = Token.objects.select_related("user").get(key=key)
            if not token.user.is_active:
                raise AuthenticationFailed("User inactive or deleted.")
            return token.user
        except Token.DoesNotExist:
            return None

    def _authenticate_access_jwt(self, token: str):
        try:
            payload = decode_access_token(token, verify_exp=True)
        except ExpiredSignatureError as exc:
            raise AuthenticationFailed("Access token expired.") from exc
        except InvalidTokenError as exc:
            raise AuthenticationFailed("Invalid access token.") from exc

        if payload.get("type") != "access":
            raise AuthenticationFailed("Invalid token type.")

        user_id = payload.get("sub")
        if user_id is None:
            raise AuthenticationFailed("Invalid token payload.")

        try:
            user = User.objects.get(id=user_id, is_active=True)
        except User.DoesNotExist as exc:
            raise AuthenticationFailed("User not found.") from exc
        return user
