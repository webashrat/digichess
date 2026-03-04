from django.urls import path

from .views import (
    ChatThreadView,
    FriendsListView,
    FriendRequestView,
    MessageListCreateView,
    RespondFriendRequestView,
    UnfriendView,
)

urlpatterns = [
    path("friend-requests/", FriendRequestView.as_view(), name="friend-requests"),
    path("friend-requests/<int:pk>/respond/", RespondFriendRequestView.as_view(), name="respond-friend-request"),
    path("friends/", FriendsListView.as_view(), name="friends"),
    path("friends/<int:user_id>/unfriend/", UnfriendView.as_view(), name="unfriend"),
    path("chat/threads/", ChatThreadView.as_view(), name="chat-threads"),
    path("chat/threads/<int:thread_id>/messages/", MessageListCreateView.as_view(), name="chat-messages"),
]
