import pytest
from django.utils import timezone

from accounts.models import OTPVerification
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
