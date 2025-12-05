from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import UserSerializer
from .models import ChatThread, FriendRequest, Friendship, Message
from utils.email import send_email_notification

User = get_user_model()


class FriendRequestSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)
    to_email = serializers.EmailField(write_only=True)

    class Meta:
        model = FriendRequest
        fields = ("id", "from_user", "to_user", "to_email", "status", "created_at", "responded_at")
        read_only_fields = ("status", "created_at", "responded_at")

    def validate_to_email(self, value):
        requester = self.context["request"].user
        if requester.email.lower() == value.lower():
            raise serializers.ValidationError("You cannot send a friend request to yourself.")
        try:
            to_user = User.objects.get(email=value.lower())
        except User.DoesNotExist:
            raise serializers.ValidationError("User with this email does not exist.")

        if Friendship.are_friends(requester, to_user):
            raise serializers.ValidationError("You are already friends.")

        if FriendRequest.objects.filter(
            from_user=requester, to_user=to_user, status=FriendRequest.STATUS_PENDING
        ).exists():
            raise serializers.ValidationError("A pending request already exists.")

        if FriendRequest.objects.filter(
            from_user=to_user, to_user=requester, status=FriendRequest.STATUS_PENDING
        ).exists():
            raise serializers.ValidationError("This user already sent you a request.")

        self.context["to_user"] = to_user
        return value

    def create(self, validated_data):
        requester = self.context["request"].user
        to_user = self.context["to_user"]
        friend_request = FriendRequest.objects.create(from_user=requester, to_user=to_user)
        send_email_notification(
            "friend_request",
            to_user.email,
            {
                "from_user": requester.name or requester.email,
                "from_email": requester.email,
            },
        )
        return friend_request


class FriendRequestResponseSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["accept", "decline"])

    def save(self, **kwargs):
        friend_request: FriendRequest = self.context["friend_request"]
        decision = self.validated_data["decision"]

        if decision == "accept":
            a, b = Friendship.normalize_pair(friend_request.from_user, friend_request.to_user)
            Friendship.objects.get_or_create(user1=a, user2=b)
            friend_request.mark(FriendRequest.STATUS_ACCEPTED)
        else:
            friend_request.mark(FriendRequest.STATUS_DECLINED)
        return friend_request


class FriendshipSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = Friendship
        fields = ("id", "user", "created_at")

    def get_user(self, obj):
        requester = self.context["request"].user
        other = obj.user1 if obj.user2 == requester else obj.user2
        return UserSerializer(other).data


class ChatThreadSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    participant_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = ChatThread
        fields = ("id", "participants", "participant_id", "created_at", "is_direct")
        read_only_fields = ("created_at", "is_direct")

    def create(self, validated_data):
        requester = self.context["request"].user
        participant_id = validated_data.pop("participant_id", None)
        if participant_id is None:
            raise serializers.ValidationError("participant_id is required.")
        try:
            other = User.objects.get(id=participant_id)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")

        if requester == other:
            raise serializers.ValidationError("You cannot start a chat with yourself.")

        thread = (
            ChatThread.objects.filter(participants=requester, is_direct=True)
            .filter(participants=other)
            .first()
        )
        if thread:
            return thread

        thread = ChatThread.objects.create(is_direct=True)
        thread.participants.add(requester, other)
        return thread


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    attachment = serializers.FileField(required=False, allow_null=True)
    attachment_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Message
        fields = ("id", "thread", "sender", "content", "attachment", "attachment_url", "attachment_type", "created_at")
        read_only_fields = ("thread", "sender", "created_at", "attachment_url", "attachment_type")

    def get_attachment_url(self, obj):
        if obj.attachment and hasattr(obj.attachment, "url"):
            return obj.attachment.url
        return None

    def create(self, validated_data):
        thread: ChatThread = self.context["thread"]
        sender = self.context["request"].user
        if not thread.participants.filter(id=sender.id).exists():
            raise serializers.ValidationError("You are not part of this thread.")
        content = validated_data.get("content", "")
        attachment = validated_data.get("attachment")
        if not content and not attachment:
            raise serializers.ValidationError("Content or attachment is required.")
        if attachment and not validated_data.get("attachment_type"):
            validated_data["attachment_type"] = attachment.content_type or ""
        return Message.objects.create(thread=thread, sender=sender, **validated_data)
