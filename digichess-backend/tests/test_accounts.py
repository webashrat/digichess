import pytest
from datetime import timedelta
from django.utils import timezone
from django.conf import settings

from accounts.models import OTPVerification, RefreshSession
from games.models import Game


@pytest.mark.django_db
def test_register_verify_login_flow(api_client):
    payload = {
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "Pass1234!",
    }
    response = api_client.post("/api/accounts/register/", payload, format="json")
    assert response.status_code == 201

    otp = OTPVerification.objects.filter(user__email=payload["email"]).first()
    assert otp is not None

    verify_response = api_client.post(
        "/api/accounts/verify-otp/",
        {"email": payload["email"], "code": otp.code},
        format="json",
    )
    assert verify_response.status_code == 200
    assert verify_response.data.get("token")

    login_response = api_client.post(
        "/api/accounts/login/",
        {"email": payload["email"], "password": payload["password"]},
        format="json",
    )
    assert login_response.status_code == 200
    assert login_response.data.get("token")


@pytest.mark.django_db
def test_login_by_username(create_user, api_client):
    user = create_user(email="loginuser@example.com", username="loginuser", password="Pass1234!")
    response = api_client.post(
        "/api/accounts/login/",
        {"username": user.username, "password": "Pass1234!"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data.get("token")


@pytest.mark.django_db
def test_refresh_session_rotates_cookie(create_user, api_client):
    user = create_user(email="refresh@example.com", username="refresh_user", password="Pass1234!")
    login_response = api_client.post(
        "/api/accounts/login/",
        {"email": user.email, "password": "Pass1234!"},
        format="json",
    )
    assert login_response.status_code == 200
    assert login_response.data.get("token")

    cookie_name = settings.AUTH_REFRESH_COOKIE_NAME
    first_refresh_cookie = api_client.cookies.get(cookie_name)
    assert first_refresh_cookie is not None
    first_refresh_value = first_refresh_cookie.value

    refresh_response = api_client.post("/api/accounts/refresh/", {}, format="json")
    assert refresh_response.status_code == 200
    assert refresh_response.data.get("token")

    second_refresh_cookie = api_client.cookies.get(cookie_name)
    assert second_refresh_cookie is not None
    assert second_refresh_cookie.value != first_refresh_value


@pytest.mark.django_db
def test_refresh_fails_after_inactivity(create_user, api_client):
    user = create_user(email="inactive@example.com", username="inactive_user", password="Pass1234!")
    login_response = api_client.post(
        "/api/accounts/login/",
        {"email": user.email, "password": "Pass1234!"},
        format="json",
    )
    assert login_response.status_code == 200

    inactivity_days = int(settings.AUTH_REFRESH_INACTIVITY_DAYS)
    RefreshSession.objects.filter(user=user).update(
        last_used_at=timezone.now() - timedelta(days=inactivity_days + 1)
    )

    refresh_response = api_client.post("/api/accounts/refresh/", {}, format="json")
    assert refresh_response.status_code == 401
    assert refresh_response.data.get("reason") == "inactive"


@pytest.mark.django_db
def test_logout_revokes_refresh_session(create_user, api_client):
    user = create_user(email="logout@example.com", username="logout_user", password="Pass1234!")
    login_response = api_client.post(
        "/api/accounts/login/",
        {"email": user.email, "password": "Pass1234!"},
        format="json",
    )
    assert login_response.status_code == 200
    token = login_response.data.get("token")
    assert token

    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    logout_response = api_client.post("/api/accounts/logout/", {}, format="json")
    assert logout_response.status_code == 200

    api_client.credentials()
    refresh_response = api_client.post("/api/accounts/refresh/", {}, format="json")
    assert refresh_response.status_code == 401


@pytest.mark.django_db
def test_profile_update(auth_client):
    client, user = auth_client()
    response = client.patch(
        "/api/accounts/me/",
        {"nickname": "TestNick", "bio": "Hello there"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["nickname"] == "TestNick"
    assert response.data["bio"] == "Hello there"


@pytest.mark.django_db
def test_public_profile_shows_live_game(create_user, api_client):
    white = create_user(email="white@example.com", username="white")
    black = create_user(email="black@example.com", username="black")
    game = Game.objects.create(
        creator=white,
        white=white,
        black=black,
        status=Game.STATUS_ACTIVE,
        started_at=timezone.now(),
    )
    response = api_client.get(f"/api/public/accounts/{white.username}/")
    assert response.status_code == 200
    assert response.data["is_playing"] is True
    assert response.data["spectate_game_id"] == game.id
