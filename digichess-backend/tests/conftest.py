import itertools

import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient


_user_counter = itertools.count(1)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    User = get_user_model()

    def _create_user(
        email=None,
        username=None,
        password="Pass1234!",
        is_active=True,
        **extra,
    ):
        idx = next(_user_counter)
        email = email or f"user{idx}@example.com"
        username = username or f"user{idx}"
        user = User.objects.create_user(
            email=email,
            username=username,
            password=password,
            is_active=is_active,
            **extra,
        )
        if is_active and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
        return user

    return _create_user


@pytest.fixture
def auth_client(create_user):
    def _auth_client(user=None):
        if user is None:
            user = create_user()
        client = APIClient()
        token, _ = Token.objects.get_or_create(user=user)
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client, user

    return _auth_client


@pytest.fixture
def create_game(auth_client, create_user):
    def _create_game(challenger=None, opponent=None, **payload):
        challenger = challenger or create_user()
        opponent = opponent or create_user()
        client, _ = auth_client(challenger)
        data = {
            "opponent_id": opponent.id,
            "time_control": "blitz",
            "preferred_color": "white",
            "rated": True,
        }
        data.update(payload)
        response = client.post("/api/games/", data, format="json")
        assert response.status_code == 201, response.data
        return response.data, challenger, opponent

    return _create_game
