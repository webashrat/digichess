"""
Query optimization utilities inspired by Lichess
- Optimized querysets with select_related/prefetch_related
- Caching frequently accessed data
- Reducing database hits
"""
from django.db.models import QuerySet
from .models import Game


def get_game_queryset():
    """
    Get optimized Game queryset with all foreign keys prefetched
    Reduces database queries from N+1 to 1
    """
    return Game.objects.select_related(
        'white',
        'black',
        'white__profile',
        'black__profile',
    )


def get_game_with_all_relations(game_id: int):
    """
    Get a single game with all relations loaded efficiently
    """
    try:
        return get_game_queryset().get(id=game_id)
    except Game.DoesNotExist:
        return None


def get_active_games_queryset(user_id: int = None):
    """
    Get active games queryset optimized for listing
    """
    from django.db import models
    queryset = get_game_queryset().filter(status=Game.STATUS_ACTIVE)
    if user_id:
        queryset = queryset.filter(
            models.Q(white_id=user_id) | models.Q(black_id=user_id)
        )
    return queryset.order_by('-created_at')


def prefetch_game_data(games: QuerySet):
    """
    Prefetch all related data for a queryset of games
    Reduces database queries when iterating
    """
    from django.db import models
    return games.prefetch_related(
        'white__profile',
        'black__profile',
    )

