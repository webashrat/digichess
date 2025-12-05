from django.db import models
from django.utils import timezone
from .models import User


class RatingHistory(models.Model):
    """Store daily rating snapshots for users"""
    
    MODES = [
        ('bullet', 'Bullet'),
        ('blitz', 'Blitz'),
        ('rapid', 'Rapid'),
        ('classical', 'Classical'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='rating_history')
    mode = models.CharField(max_length=20, choices=MODES)
    rating = models.IntegerField()
    date = models.DateField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'accounts_ratinghistory'
        unique_together = [['user', 'mode', 'date']]
        ordering = ['-date']
        indexes = [
            models.Index(fields=['user', 'mode', '-date']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.mode} - {self.rating} - {self.date}"



