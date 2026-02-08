import pytest

from social.models import FriendRequest, Friendship
from notifications.models import Notification


@pytest.mark.django_db
def test_friend_request_flow(auth_client, create_user):
    requester = create_user(email="req@example.com", username="req")
    recipient = create_user(email="rec@example.com", username="rec")
    client, _ = auth_client(requester)

    response = client.post(
        "/api/social/friend-requests/",
        {"to_user_id": recipient.id},
        format="json",
    )
    assert response.status_code == 201
    assert FriendRequest.objects.filter(from_user=requester, to_user=recipient).exists()
    assert Notification.objects.filter(user=recipient, notification_type="friend_request").exists()

    friend_request = FriendRequest.objects.get(from_user=requester, to_user=recipient)
    recipient_client, _ = auth_client(recipient)
    respond = recipient_client.post(
        f"/api/social/friend-requests/{friend_request.id}/respond/",
        {"decision": "accept"},
        format="json",
    )
    assert respond.status_code == 200
    assert Friendship.are_friends(requester, recipient) is True


@pytest.mark.django_db
def test_friend_request_decline(auth_client, create_user):
    requester = create_user(email="req2@example.com", username="req2")
    recipient = create_user(email="rec2@example.com", username="rec2")
    client, _ = auth_client(requester)

    response = client.post(
        "/api/social/friend-requests/",
        {"to_user_id": recipient.id},
        format="json",
    )
    assert response.status_code == 201
    friend_request = FriendRequest.objects.get(from_user=requester, to_user=recipient)

    recipient_client, _ = auth_client(recipient)
    respond = recipient_client.post(
        f"/api/social/friend-requests/{friend_request.id}/respond/",
        {"decision": "decline"},
        format="json",
    )
    assert respond.status_code == 200
    friend_request.refresh_from_db()
    assert friend_request.status == FriendRequest.STATUS_DECLINED
    assert Friendship.are_friends(requester, recipient) is False


@pytest.mark.django_db
def test_chat_thread_and_message(auth_client, create_user):
    user_a = create_user(email="chat1@example.com", username="chat1")
    user_b = create_user(email="chat2@example.com", username="chat2")
    client_a, _ = auth_client(user_a)

    thread_resp = client_a.post(
        "/api/social/chat/threads/",
        {"participant_id": user_b.id},
        format="json",
    )
    assert thread_resp.status_code == 201
    thread_id = thread_resp.data["id"]

    msg_resp = client_a.post(
        f"/api/social/chat/threads/{thread_id}/messages/",
        {"content": "Hello there"},
        format="json",
    )
    assert msg_resp.status_code == 201
    assert msg_resp.data["content"] == "Hello there"
    assert msg_resp.data["sender"]["id"] == user_a.id


@pytest.mark.django_db
def test_chat_message_requires_participation(auth_client, create_user):
    user_a = create_user(email="chat3@example.com", username="chat3")
    user_b = create_user(email="chat4@example.com", username="chat4")
    outsider = create_user(email="chat5@example.com", username="chat5")
    client_a, _ = auth_client(user_a)

    thread_resp = client_a.post(
        "/api/social/chat/threads/",
        {"participant_id": user_b.id},
        format="json",
    )
    thread_id = thread_resp.data["id"]

    outsider_client, _ = auth_client(outsider)
    response = outsider_client.post(
        f"/api/social/chat/threads/{thread_id}/messages/",
        {"content": "I should not post"},
        format="json",
    )
    assert response.status_code == 403
