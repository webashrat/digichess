from django.db import models
from django.utils import timezone
from .models import User


class RatingHistory(models.Model):
    """Store rating snapshots for users"""
    
    MODES = [
        ('bullet', 'Bullet'),
        ('blitz', 'Blitz'),
        ('rapid', 'Rapid'),
        ('classical', 'Classical'),
    ]
    
    SOURCE_CHOICES = [
        ('game', 'Game'),
        ('daily', 'Daily'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='rating_history')
    mode = models.CharField(max_length=20, choices=MODES)
    rating = models.IntegerField()
    date = models.DateField(default=timezone.now)
    recorded_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='game')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'accounts_ratinghistory'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['user', 'mode', '-recorded_at']),
            models.Index(fields=['user', 'mode', '-date']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.mode} - {self.rating} - {self.recorded_at.date()}"




