from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import time
import random
import chess

from utils.redis_client import get_redis
from .models import Game, Tournament, TournamentParticipant, TournamentGame
from .views import FinishGameView, GameMoveView
from .serializers import GameSerializer
from .bot_utils import get_bot_move_with_error

User = get_user_model()


@shared_task
def update_ratings_async(game_id: int, result: str):
    try:
        game = Game.objects.get(id=game_id)
    except Game.DoesNotExist:
        return
    fv = FinishGameView()
    fv.update_ratings(game, result)
    return


@shared_task
def make_bot_move_async(game_id: int):
    """Make a move for a bot player"""
    import time
    from django.utils import timezone
    from games.views import GameMoveView
    
    try:
        game = Game.objects.get(id=game_id)
    except Game.DoesNotExist:
        return
    
    # Check if game is still active
    if game.status != Game.STATUS_ACTIVE:
        return
    
    # Load board
    board = chess.Board(game.current_fen or chess.STARTING_FEN)
    
    # Determine whose turn it is
    current_player = game.white if board.turn == chess.WHITE else game.black
    
    # Check if current player is a bot
    if not current_player or not current_player.is_bot:
        return
    
    # Get bot rating for the current time control
    rating_field_map = {
        Game.TIME_BULLET: 'rating_bullet',
        Game.TIME_BLITZ: 'rating_blitz',
        Game.TIME_RAPID: 'rating_rapid',
        Game.TIME_CLASSICAL: 'rating_classical',
    }
    rating_field = rating_field_map.get(game.time_control, 'rating_blitz')
    bot_rating = getattr(current_player, rating_field, 800)
    
    # Get bot move - use Lichess APIs for optimization
    move_list = (game.moves or "").strip().split()
    ply_count = len(move_list)
    
    try:
        bot_move = get_bot_move_with_error(
            board, 
            bot_rating,
            time_control=game.time_control,
            ply_count=ply_count
        )
        move_san = board.san(bot_move)
        
        # Make the move directly (simulate a POST request)
        mv = GameMoveView()
        from unittest.mock import Mock
        mock_request = Mock()
        mock_request.user = current_player
        mock_request.data = {'move': move_san}
        
        # Make the move
        response = mv.post(mock_request, game.id)
        
        # The move handler will automatically trigger the next bot move if needed
    except Exception as e:
        import sys
        print(f"[bot_move] Error making bot move: {e}", file=sys.stderr)


@shared_task
def broadcast_clock_updates():
    r = get_redis()
    # Implementation for clock updates if needed
    pass


@shared_task
def swiss_pairings(tournament_id: int):
    """Swiss tournament pairings task"""
    # Placeholder - implement if needed
    pass
