"""
Bot model and utilities for chess bots
"""
from django.db import models
from .models import User


class Bot(User):
    """
    Bot users - special users that play automatically
    Bots are identified by is_bot=True in the User model
    """
    class Meta:
        proxy = True

    @classmethod
    def get_bots_by_rating(cls, mode='blitz', min_rating=None, max_rating=None):
        """Get bots filtered by rating for a specific mode"""
        rating_field = f'rating_{mode}'
        queryset = User.objects.filter(is_bot=True, is_active=True)
        
        if min_rating:
            queryset = queryset.filter(**{f'{rating_field}__gte': min_rating})
        if max_rating:
            queryset = queryset.filter(**{f'{rating_field}__lte': max_rating})
        
        return queryset.order_by(rating_field)


