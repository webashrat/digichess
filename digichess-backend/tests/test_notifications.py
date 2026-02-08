import pytest

from notifications.models import Notification


@pytest.mark.django_db
def test_notification_filters_out_self_challenge(auth_client, create_user):
    client, user = auth_client()
    Notification.objects.create(
        user=user,
        notification_type="game_challenge",
        title="Challenge",
        message="You challenged someone",
        data={"from_user_id": user.id, "from_username": user.username},
    )
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    types = [note["notification_type"] for note in response.data.get("results", [])]
    assert "game_challenge" not in types

    unread = client.get("/api/notifications/unread-count/")
    assert unread.status_code == 200
    assert unread.data.get("unread_count") == 0


@pytest.mark.django_db
def test_notification_lists_visible_items(auth_client, create_user):
    client, user = auth_client()
    Notification.objects.create(
        user=user,
        notification_type="friend_request",
        title="Friend request",
        message="User sent you a friend request",
        data={"from_user_id": 999},
    )
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    results = response.data.get("results", [])
    assert len(results) == 1
    assert results[0]["notification_type"] == "friend_request"


@pytest.mark.django_db
def test_notification_mark_read_and_delete(auth_client, create_user):
    client, user = auth_client()
    note1 = Notification.objects.create(
        user=user,
        notification_type="friend_request",
        title="Friend request",
        message="Request",
    )
    note2 = Notification.objects.create(
        user=user,
        notification_type="challenge_expired",
        title="Challenge expired",
        message="Expired",
    )

    mark_one = client.post(f"/api/notifications/{note1.id}/mark-read/")
    assert mark_one.status_code == 200
    note1.refresh_from_db()
    assert note1.read is True

    mark_all = client.post("/api/notifications/mark-read/")
    assert mark_all.status_code == 200
    note2.refresh_from_db()
    assert note2.read is True

    delete_resp = client.delete(f"/api/notifications/{note1.id}/")
    assert delete_resp.status_code == 200
    assert Notification.objects.filter(id=note1.id).exists() is False
