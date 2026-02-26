import hashlib
import secrets
from datetime import timedelta
from typing import Optional, Tuple

import jwt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import RefreshSession, User


def _hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _request_ip(request) -> Optional[str]:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _access_lifetime_minutes() -> int:
    return int(getattr(settings, "AUTH_ACCESS_TOKEN_MINUTES", 15))


def _refresh_lifetime_days() -> int:
    return int(getattr(settings, "AUTH_REFRESH_TOKEN_DAYS", 180))


def _refresh_inactivity_days() -> int:
    return int(getattr(settings, "AUTH_REFRESH_INACTIVITY_DAYS", 60))


def create_access_token(user: User) -> str:
    now = timezone.now()
    exp = now + timedelta(minutes=_access_lifetime_minutes())
    payload = {
        "type": "access",
        "sub": str(user.id),
        "exp": int(exp.timestamp()),
        "iat": int(now.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str, verify_exp: bool = True) -> dict:
    options = {"verify_exp": verify_exp}
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=["HS256"],
        options=options,
    )


def issue_refresh_session(user: User, request) -> Tuple[str, RefreshSession]:
    now = timezone.now()
    raw_token = secrets.token_urlsafe(48)
    session = RefreshSession.objects.create(
        user=user,
        token_hash=_hash_refresh_token(raw_token),
        last_used_at=now,
        expires_at=now + timedelta(days=_refresh_lifetime_days()),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1024],
        ip_address=_request_ip(request),
    )
    return raw_token, session


def rotate_refresh_session(raw_token: str, request):
    if not raw_token:
        return None, "missing"

    now = timezone.now()
    token_hash = _hash_refresh_token(raw_token)
    with transaction.atomic():
        session = (
            RefreshSession.objects.select_for_update()
            .select_related("user")
            .filter(token_hash=token_hash)
            .first()
        )
        if not session:
            return None, "invalid"
        if session.revoked_at is not None:
            return None, "revoked"
        if session.expires_at <= now:
            session.revoked_at = now
            session.revoked_reason = RefreshSession.REVOKED_EXPIRED
            session.save(update_fields=["revoked_at", "revoked_reason"])
            return None, "expired"
        inactivity_cutoff = now - timedelta(days=_refresh_inactivity_days())
        if session.last_used_at < inactivity_cutoff:
            session.revoked_at = now
            session.revoked_reason = RefreshSession.REVOKED_INACTIVE
            session.save(update_fields=["revoked_at", "revoked_reason"])
            return None, "inactive"

        next_raw = secrets.token_urlsafe(48)
        session.token_hash = _hash_refresh_token(next_raw)
        session.last_used_at = now
        session.expires_at = now + timedelta(days=_refresh_lifetime_days())
        session.user_agent = (request.META.get("HTTP_USER_AGENT") or session.user_agent or "")[:1024]
        session.ip_address = _request_ip(request) or session.ip_address
        session.save(
            update_fields=[
                "token_hash",
                "last_used_at",
                "expires_at",
                "user_agent",
                "ip_address",
            ]
        )
        return {"user": session.user, "refresh_token": next_raw}, None


def revoke_refresh_session(raw_token: Optional[str], reason: str) -> None:
    if not raw_token:
        return
    token_hash = _hash_refresh_token(raw_token)
    now = timezone.now()
    (
        RefreshSession.objects.filter(token_hash=token_hash, revoked_at__isnull=True)
        .update(revoked_at=now, revoked_reason=reason)
    )


def set_refresh_cookie(response, raw_token: str) -> None:
    domain = getattr(settings, "AUTH_REFRESH_COOKIE_DOMAIN", "") or None
    response.set_cookie(
        key=getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "digichess_refresh"),
        value=raw_token,
        max_age=_refresh_lifetime_days() * 24 * 60 * 60,
        httponly=True,
        secure=bool(getattr(settings, "AUTH_REFRESH_COOKIE_SECURE", True)),
        samesite=getattr(settings, "AUTH_REFRESH_COOKIE_SAMESITE", "Lax"),
        path=getattr(settings, "AUTH_REFRESH_COOKIE_PATH", "/api/accounts/"),
        domain=domain,
    )


def clear_refresh_cookie(response) -> None:
    domain = getattr(settings, "AUTH_REFRESH_COOKIE_DOMAIN", "") or None
    response.delete_cookie(
        key=getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "digichess_refresh"),
        path=getattr(settings, "AUTH_REFRESH_COOKIE_PATH", "/api/accounts/"),
        domain=domain,
        samesite=getattr(settings, "AUTH_REFRESH_COOKIE_SAMESITE", "Lax"),
    )
