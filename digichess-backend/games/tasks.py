from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone
from asgiref.sync import async_to_sync
from datetime import timedelta
from channels.layers import get_channel_layer
import time
import random
import chess

from utils.redis_client import get_redis
from .models import Game, Tournament, TournamentParticipant, TournamentGame
from .views import FinishGameView, GameMoveView
from .serializers import GameSerializer
from .bot_utils import get_bot_move_with_error
from .game_proxy import GameProxy
from .game_core import compute_clock_snapshot, FIRST_MOVE_GRACE_SECONDS, CHALLENGE_EXPIRY_MINUTES
from .move_optimizer import process_move_optimized, latency_monitor
from accounts.models_rating_history import RatingHistory

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
def store_daily_rating_snapshots():
    """Store a daily UTC snapshot of each user's ratings."""
    snapshot_date = timezone.now().astimezone(timezone.utc).date()
    rating_fields = {
        "bullet": "rating_bullet",
        "blitz": "rating_blitz",
        "rapid": "rating_rapid",
        "classical": "rating_classical",
    }

    entries = []
    users = User.objects.all().only("id", *rating_fields.values())
    for user in users.iterator(chunk_size=1000):
        for mode, field in rating_fields.items():
            rating = getattr(user, field, None)
            if rating is None:
                continue
            entries.append(
                RatingHistory(
                    user_id=user.id,
                    mode=mode,
                    rating=rating,
                    date=snapshot_date,
                )
            )

    if entries:
        RatingHistory.objects.bulk_create(entries, ignore_conflicts=True, batch_size=1000)


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
    """Broadcast clock updates for all active games via WebSocket"""
    from django.utils import timezone
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    import chess
    
    active_games = Game.objects.filter(status=Game.STATUS_ACTIVE).select_related('white', 'black')
    now = timezone.now()
    channel_layer = get_channel_layer()
    
    if not channel_layer:
        return
    
    for game in active_games:
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            board = chess.Board()
        snapshot = compute_clock_snapshot(game, now=now, board=board)
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {
                "type": "game.event",
                "payload": {
                    "type": "clock",
                    "game_id": game.id,
                    "white_time_left": snapshot["white_time_left"],
                    "black_time_left": snapshot["black_time_left"],
                    "turn": snapshot["turn"],
                },
            },
        )


@shared_task
def swiss_pairings(tournament_id: int):
    """Swiss tournament pairings task"""
    # Placeholder - implement if needed
    pass


@shared_task
def flush_dirty_games():
    """Flush all dirty games to database (Lichess-style batched writes)"""
    GameProxy.flush_all_dirty()


@shared_task
def check_game_timeouts():
    """
    Periodically check active games for timeouts.
    This ensures games end when time runs out even if users disconnect.
    Runs every 5 seconds via Celery Beat.
    """
    from django.utils import timezone
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from .serializers import GameSerializer
    import chess
    
    active_games = Game.objects.filter(status=Game.STATUS_ACTIVE)
    now = timezone.now()
    channel_layer = get_channel_layer()
    
    for game in active_games:
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            board = chess.Board()
        move_count = len((game.moves or "").strip().split()) if game.moves else 0
        # Do not enforce main clock timeouts until both players have moved once
        if move_count < 2:
            continue
        snapshot = compute_clock_snapshot(game, now=now, board=board)
        result = None
        if snapshot["turn"] == "white" and snapshot["white_time_left"] <= 0:
            result = Game.RESULT_BLACK
        if snapshot["turn"] == "black" and snapshot["black_time_left"] <= 0:
            result = Game.RESULT_WHITE
        if not result:
            continue

        game.white_time_left = snapshot["white_time_left"]
        game.black_time_left = snapshot["black_time_left"]
        game.status = Game.STATUS_FINISHED
        game.result = result
        game.finished_at = now
        game.save(
            update_fields=[
                "status",
                "result",
                "finished_at",
                "white_time_left",
                "black_time_left",
            ]
        )
        game.refresh_from_db()
        if game.rated:
            FinishGameView().update_ratings(game, result)
        if channel_layer:
            game_data = GameSerializer(game).data
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": result,
                        "reason": "timeout",
                        "game": game_data,
                    },
                },
            )


@shared_task
def check_first_move_timeouts():
    """
    Abort games if a player fails to make their first move within the grace period.
    - White must move within FIRST_MOVE_GRACE_SECONDS of game creation.
    - Black must move within FIRST_MOVE_GRACE_SECONDS after White's first move.
    """
    now = timezone.now()
    channel_layer = get_channel_layer()
    games = Game.objects.filter(status=Game.STATUS_ACTIVE)

    for game in games:
        move_count = len((game.moves or "").strip().split()) if game.moves else 0

        if move_count == 0:
            if not game.started_at:
                continue
            deadline = game.started_at + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)
            if now <= deadline:
                continue
        elif move_count == 1:
            if not game.started_at:
                continue
            anchor = game.last_move_at or game.started_at
            deadline = anchor + timedelta(seconds=FIRST_MOVE_GRACE_SECONDS)
            if now <= deadline:
                continue
        else:
            continue

        game.status = Game.STATUS_ABORTED
        game.result = Game.RESULT_NONE
        game.finished_at = now
        game.save(update_fields=["status", "result", "finished_at"])

        if channel_layer:
            game_data = GameSerializer(game).data
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": game.result,
                        "reason": "first_move_timeout",
                        "game": game_data,
                    },
                },
            )


@shared_task
def check_pending_challenge_expiry():
    """Abort pending challenges that exceed the expiry window."""
    now = timezone.now()
    expiry_cutoff = now - timedelta(minutes=CHALLENGE_EXPIRY_MINUTES)
    channel_layer = get_channel_layer()
    games = Game.objects.filter(status=Game.STATUS_PENDING, created_at__lt=expiry_cutoff)

    for game in games:
        game.status = Game.STATUS_ABORTED
        game.result = Game.RESULT_NONE
        game.finished_at = now
        game.save(update_fields=["status", "result", "finished_at"])

        if channel_layer:
            game_data = GameSerializer(game).data
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": game.result,
                        "reason": "challenge_expired",
                        "game": game_data,
                    },
                },
            )
