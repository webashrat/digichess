from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

User = get_user_model()


class Friendship(models.Model):
    user1 = models.ForeignKey(User, related_name="friendship_user1", on_delete=models.CASCADE)
    user2 = models.ForeignKey(User, related_name="friendship_user2", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user1", "user2"], name="unique_friendship_pair"),
            models.CheckConstraint(check=Q(user1__lt=F("user2")), name="friendship_canonical_order"),
        ]

    @classmethod
    def normalize_pair(cls, a: User, b: User):
        return (a, b) if a.id < b.id else (b, a)

    @classmethod
    def are_friends(cls, a: User, b: User) -> bool:
        a, b = cls.normalize_pair(a, b)
        return cls.objects.filter(user1=a, user2=b).exists()

    def __str__(self):
        return f"{self.user1.email} ↔ {self.user2.email}"


class FriendRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_DECLINED, "Declined"),
    ]

    from_user = models.ForeignKey(User, related_name="sent_requests", on_delete=models.CASCADE)
    to_user = models.ForeignKey(User, related_name="received_requests", on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("from_user", "to_user")
        indexes = [models.Index(fields=["to_user", "status"])]

    def mark(self, status: str):
        self.status = status
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])

    def __str__(self):
        return f"{self.from_user.email} -> {self.to_user.email} ({self.status})"


class ChatThread(models.Model):
    participants = models.ManyToManyField(User, related_name="chat_threads")
    created_at = models.DateTimeField(auto_now_add=True)
    is_direct = models.BooleanField(default=True)

    def __str__(self):
        users = ", ".join(self.participants.values_list("email", flat=True))
        return f"Thread [{users}]"


class Message(models.Model):
    thread = models.ForeignKey(ChatThread, related_name="messages", on_delete=models.CASCADE)
    sender = models.ForeignKey(User, related_name="messages", on_delete=models.CASCADE)
    content = models.TextField()
    attachment = models.FileField(upload_to="attachments/", null=True, blank=True)
    attachment_type = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender.email}: {self.content[:30]}"
