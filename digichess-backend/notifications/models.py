from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid

User = get_user_model()


class Notification(models.Model):
    """Notification model similar to Lichess's notification system"""
    
    NOTIFICATION_TYPES = [
        ('game_challenge', 'Game Challenge'),
        ('game_move', 'Game Move'),
        ('friend_request', 'Friend Request'),
        ('message', 'Message'),
        ('rematch', 'Rematch'),
        ('rematch_requested', 'Rematch Requested'),
        ('challenge_rejected', 'Challenge Rejected'),
        ('tournament_start', 'Tournament Start'),
        ('tournament_result', 'Tournament Result'),
        ('tournament_cancelled', 'Tournament Cancelled'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)  # Store additional data like game_id, user_id, etc.
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'read', '-created_at']),
            models.Index(fields=['user', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.notification_type} for {self.user.username} ({'read' if self.read else 'unread'})"
    
    def mark_as_read(self):
        """Mark notification as read"""
        self.read = True
        self.save(update_fields=['read'])




