from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import ChatThread, FriendRequest, Friendship, Message
from .serializers import (
    ChatThreadSerializer,
    FriendRequestResponseSerializer,
    FriendRequestSerializer,
    FriendshipSerializer,
    MessageSerializer,
)


class FriendRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        incoming = FriendRequest.objects.filter(
            to_user=request.user, status=FriendRequest.STATUS_PENDING
        )
        outgoing = FriendRequest.objects.filter(
            from_user=request.user, status=FriendRequest.STATUS_PENDING
        )
        data = {
            "incoming": FriendRequestSerializer(incoming, many=True).data,
            "outgoing": FriendRequestSerializer(outgoing, many=True).data,
        }
        return Response(data)

    def post(self, request):
        serializer = FriendRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        friend_request = serializer.save()
        return Response(FriendRequestSerializer(friend_request).data, status=status.HTTP_201_CREATED)


class RespondFriendRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        friend_request = get_object_or_404(
            FriendRequest, id=pk, to_user=request.user, status=FriendRequest.STATUS_PENDING
        )
        serializer = FriendRequestResponseSerializer(
            data=request.data, context={"friend_request": friend_request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FriendRequestSerializer(friend_request).data)


class FriendsListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # allow public view; if unauthenticated and target user hides friends, return empty
        target_user_id = request.query_params.get("user_id")
        User = get_user_model()
        target_user = request.user if not target_user_id else get_object_or_404(User, id=target_user_id)
        if not target_user.show_friends_public and not request.user.is_authenticated:
            return Response([], status=status.HTTP_200_OK)
        friendships = Friendship.objects.filter(user1=target_user) | Friendship.objects.filter(
            user2=target_user
        )
        serializer = FriendshipSerializer(friendships, many=True, context={"request": request})
        return Response(serializer.data)


class ChatThreadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        threads = ChatThread.objects.filter(participants=request.user).prefetch_related("participants")
        serializer = ChatThreadSerializer(threads, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ChatThreadSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        thread = serializer.save()
        return Response(ChatThreadSerializer(thread).data, status=status.HTTP_201_CREATED)


class MessageListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_thread(self, request, thread_id: int):
        thread = get_object_or_404(ChatThread, id=thread_id)
        if not thread.participants.filter(id=request.user.id).exists():
            raise permissions.PermissionDenied("You are not part of this chat.")
        return thread

    def get(self, request, thread_id: int):
        thread = self.get_thread(request, thread_id)
        messages = thread.messages.select_related("sender")
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request, thread_id: int):
        thread = self.get_thread(request, thread_id)
        serializer = MessageSerializer(
            data=request.data, context={"request": request, "thread": thread}
        )
        serializer.is_valid(raise_exception=True)
        message = serializer.save()
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)
