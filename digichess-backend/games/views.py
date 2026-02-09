from django.conf import settings
from typing import List, Optional
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import models
from datetime import timedelta
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
import chess
import chess.engine
import os
from pathlib import Path
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from utils.redis_client import get_redis

from .models import Game
from .serializers import GameSerializer, MoveSerializer
from .game_core import (
    apply_move,
    MoveResult,
    CHALLENGE_EXPIRY_MINUTES,
    build_board_from_moves,
    is_insufficient_material,
)
from .stockfish_utils import ensure_stockfish_works, get_stockfish_path


class GameListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        games = (
            Game.objects.filter(white=request.user) | Game.objects.filter(black=request.user)
        ).select_related("white", "black").distinct()
        serializer = GameSerializer(games, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = GameSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)


class GameDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        # Allow anyone to view completed/aborted games (spectators)
        # But restrict active/pending games to players only
        if game.status in [Game.STATUS_ACTIVE, Game.STATUS_PENDING]:
            if game.white != request.user and game.black != request.user:
                raise PermissionDenied("You are not part of this game.")
        return game

    def get(self, request, pk: int):
        game = self.get_object(request, pk)
        return Response(GameSerializer(game).data)


class GameMoveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _broadcast_game_state(self, game: Game, state: dict, legal_moves: List[str]):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        payload = {
            "type": "gameState",
            "game_id": game.id,
            **state,
            "legal_moves": legal_moves,
        }
        try:
            from games.lichess_game_flow import get_game_state_export
            game_state = get_game_state_export(
                state.get("fen") or chess.STARTING_FEN,
                state.get("moves") or "",
                "standard",
            )
            if game_state:
                payload["game_state"] = game_state
        except Exception:
            pass

        try:
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": payload,
                },
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to broadcast game state via WebSocket: {e}")

    def _broadcast_game_finished(self, game: Game, reason: Optional[str]):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        game_data = GameSerializer(game).data
        try:
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": game.result,
                        "reason": reason,
                        "game": game_data,
                    },
                },
            )
        except Exception:
            pass

    def _apply_and_broadcast(self, game_id: int, player, move_san: str) -> MoveResult:
        result = apply_move(game_id, player, move_san)
        if result.state and result.game:
            self._broadcast_game_state(result.game, result.state, result.legal_moves or [])
            if result.draw_offer_cleared:
                try:
                    channel_layer = get_channel_layer()
                    if channel_layer:
                        async_to_sync(channel_layer.group_send)(
                            f"game_{result.game.id}",
                            {
                                "type": "game.event",
                                "payload": {
                                    "type": "draw_response",
                                    "game_id": result.game.id,
                                    "decision": "auto_decline",
                                },
                            },
                        )
                except Exception:
                    pass
        if result.game and result.finished:
            result.game.refresh_from_db()
            if result.game.rated and result.game.result in {
                Game.RESULT_WHITE,
                Game.RESULT_BLACK,
                Game.RESULT_DRAW,
            }:
                FinishGameView().update_ratings(result.game, result.game.result)
            self._broadcast_game_finished(result.game, result.finish_reason)
        return result

    def _make_bot_move(self, game: Game, bot_player):
        """Make a move for a bot player synchronously using the core."""
        from games.bot_utils import get_bot_move_with_error

        game.refresh_from_db()
        if game.status != Game.STATUS_ACTIVE:
            return

        board = self._load_board(game)
        current_player = game.white if board.turn == chess.WHITE else game.black
        if current_player != bot_player or not bot_player.is_bot:
            return

        rating_field_map = {
            Game.TIME_BULLET: "rating_bullet",
            Game.TIME_BLITZ: "rating_blitz",
            Game.TIME_RAPID: "rating_rapid",
            Game.TIME_CLASSICAL: "rating_classical",
        }
        rating_field = rating_field_map.get(game.time_control, "rating_blitz")
        bot_rating = getattr(bot_player, rating_field, 800)

        move_list = (game.moves or "").strip().split()
        ply_count = len(move_list)

        try:
            bot_move = get_bot_move_with_error(
                board,
                bot_rating,
                time_control=game.time_control,
                ply_count=ply_count,
            )
            move_san = board.san(bot_move)
        except Exception as e:
            import sys
            print(f"[bot_move] Error getting bot move: {e}", file=sys.stderr)
            return

        result = self._apply_and_broadcast(game.id, bot_player, move_san)
        if not result.ok or not result.game:
            return

        if result.game.status == Game.STATUS_ACTIVE:
            try:
                next_board = chess.Board(result.game.current_fen or chess.STARTING_FEN)
            except Exception:
                next_board = chess.Board()
            next_player = (
                result.game.white if next_board.turn == chess.WHITE else result.game.black
            )
            if next_player and next_player.is_bot:
                import time
                time.sleep(0.1)
                self._make_bot_move(result.game, next_player)

    def _load_board(self, game: Game) -> chess.Board:
        try:
            return chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            return chess.Board()

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.white != request.user and game.black != request.user:
            raise PermissionDenied("You are not part of this game.")
        if game.status in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        move_san = serializer.validated_data["move"]
        result = self._apply_and_broadcast(game.id, request.user, move_san)
        if not result.ok:
            return Response({"detail": result.error or "Illegal move."}, status=status.HTTP_400_BAD_REQUEST)

        data = GameSerializer(result.game).data if result.game else {}

        if result.game and result.game.status == Game.STATUS_ACTIVE:
            try:
                board = chess.Board(result.game.current_fen or chess.STARTING_FEN)
            except Exception:
                board = chess.Board()
            next_player = (
                result.game.white if board.turn == chess.WHITE else result.game.black
            )
            if next_player and next_player.is_bot:
                try:
                    self._make_bot_move(result.game, next_player)
                except Exception as e:
                    import sys
                    print(f"[bot_move] Error making bot move synchronously: {e}", file=sys.stderr)

        return Response(data)


class FinishGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.white != request.user and game.black != request.user:
            raise PermissionDenied("You are not part of this game.")
        # Restrict finish if more than 5 moves per side (10 ply)
        move_count = len((game.moves or "").split())
        if move_count > 10:
            return Response({"detail": "Finish not allowed after 5 moves each."}, status=status.HTTP_400_BAD_REQUEST)
        result = request.data.get("result", Game.RESULT_NONE)
        game.finish(result)
        # Refresh game from database to get updated rated status
        game.refresh_from_db()
        # Update ratings only for rated games with valid results
        if game.rated and result in {
            Game.RESULT_WHITE,
            Game.RESULT_BLACK,
            Game.RESULT_DRAW,
        }:
            # Always update ratings synchronously to ensure they're updated immediately
            self.update_ratings(game, result)
        # Resolve predictions
        try:
            from games.models_prediction import Prediction
            preds = Prediction.objects.filter(game=game, resolved=False)
            for p in preds:
                correct = False
                if result == Game.RESULT_WHITE and p.predicted_result == "white":
                    correct = True
                if result == Game.RESULT_BLACK and p.predicted_result == "black":
                    correct = True
                if result == Game.RESULT_DRAW and p.predicted_result == "draw":
                    correct = True
                p.correct = correct
                p.resolved = True
                p.save(update_fields=["correct", "resolved"])
                user = p.user
                if correct:
                    user.rating_digiquiz += 5
                    user.digiquiz_correct += 1
                else:
                    user.rating_digiquiz -= 15
                    user.digiquiz_wrong += 1
                user.save(update_fields=["rating_digiquiz", "digiquiz_correct", "digiquiz_wrong"])
        except Exception:
            pass
        return Response(GameSerializer(game).data)

    def post_rematch(self, request, pk: int):
        # Not used; kept for clarity
        pass

    def update_ratings(self, game: Game, result: str):
        import sys
        
        # Only update ratings for rated games
        if not game.rated:
            print(f"[rating] Game {game.id} is not rated, skipping rating update", file=sys.stderr)
            return
        
        # Check if game has valid players
        if not game.white or not game.black:
            print(f"[rating] Game {game.id} missing players (white={game.white}, black={game.black}), skipping rating update", file=sys.stderr)
            return
        
        # Check if result is valid
        if result not in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
            print(f"[rating] Game {game.id} has invalid result: {result}, skipping rating update", file=sys.stderr)
            return
        
        print(f"[rating] Updating ratings for game {game.id}, result: {result}, time_control: {game.time_control}, white: {game.white.username or game.white.id}, black: {game.black.username or game.black.id}", file=sys.stderr)
        
        # Simplified Glicko-2 (single update step)
        def glicko2_update(ra, rd, vol, rb, rdb, score):
            # Convert to Glicko scale
            q = 0.0057565
            def g(rd):
                return 1 / ((1 + (3 * q**2 * rd**2) / (3.14159**2)) ** 0.5)
            def E(ra, rb, rdb):
                return 1 / (1 + 10 ** (-g(rdb) * (ra - rb) / 400))
            ea = E(ra, rb, rdb)
            d2 = 1 / (q**2 * g(rdb)**2 * ea * (1 - ea))
            new_rd = min(350, (rd**-2 + d2**-1) ** -0.5)
            new_r = ra + q / ((1 / new_rd**2)) * g(rdb) * (score - ea)
            return round(new_r), round(new_rd), vol  # keep vol unchanged for simplicity

        control_map = {
            Game.TIME_BULLET: ("rating_bullet", "rating_bullet_rd", "rating_bullet_vol"),
            Game.TIME_BLITZ: ("rating_blitz", "rating_blitz_rd", "rating_blitz_vol"),
            Game.TIME_RAPID: ("rating_rapid", "rating_rapid_rd", "rating_rapid_vol"),
            Game.TIME_CLASSICAL: ("rating_classical", "rating_classical_rd", "rating_classical_vol"),
        }
        fields = control_map.get(game.time_control)
        if not fields:
            # Time control not in map (e.g., TIME_CUSTOM), skip rating update
            import sys
            print(f"[rating] Game {game.id} has unsupported time_control: {game.time_control}, skipping rating update", file=sys.stderr)
            return
        
        r_field, rd_field, vol_field = fields
        mode_map = {
            Game.TIME_BULLET: "bullet",
            Game.TIME_BLITZ: "blitz",
            Game.TIME_RAPID: "rapid",
            Game.TIME_CLASSICAL: "classical",
        }
        mode_key = mode_map.get(game.time_control)
        snapshot_time = game.finished_at or timezone.now()
        snapshot_date = timezone.localdate(snapshot_time)
        
        # Refresh users from database to get latest ratings
        game.white.refresh_from_db()
        game.black.refresh_from_db()
        
        white_rating = getattr(game.white, r_field, 800)
        black_rating = getattr(game.black, r_field, 800)
        white_rd = getattr(game.white, rd_field, 350.0)
        black_rd = getattr(game.black, rd_field, 350.0)
        white_vol = getattr(game.white, vol_field, 0.06)
        black_vol = getattr(game.black, vol_field, 0.06)
        
        if result == Game.RESULT_WHITE:
            white_score, black_score = 1, 0
        elif result == Game.RESULT_BLACK:
            white_score, black_score = 0, 1
        else:
            white_score = black_score = 0.5

        new_w_r, new_w_rd, new_w_vol = glicko2_update(
            white_rating, white_rd, white_vol, black_rating, black_rd, white_score
        )
        new_b_r, new_b_rd, new_b_vol = glicko2_update(
            black_rating, black_rd, black_vol, white_rating, white_rd, black_score
        )
        white_delta = new_w_r - white_rating
        black_delta = new_b_r - black_rating
        
        # Update and save white player ratings
        try:
            setattr(game.white, r_field, new_w_r)
            setattr(game.white, rd_field, new_w_rd)
            setattr(game.white, vol_field, new_w_vol)
            game.white.save(update_fields=[r_field, rd_field, vol_field])
            print(f"[rating] Successfully updated white player ({game.white.username or game.white.id}) ratings: {white_rating} -> {new_w_r}", file=sys.stderr)
            if mode_key:
                from accounts.models_rating_history import RatingHistory
                RatingHistory.objects.get_or_create(
                    user_id=game.white.id,
                    mode=mode_key,
                    recorded_at=snapshot_time,
                    source="game",
                    defaults={"rating": new_w_r, "date": snapshot_date},
                )
        except Exception as e:
            print(f"[rating] Error updating white player ratings: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        # Update and save black player ratings
        try:
            setattr(game.black, r_field, new_b_r)
            setattr(game.black, rd_field, new_b_rd)
            setattr(game.black, vol_field, new_b_vol)
            game.black.save(update_fields=[r_field, rd_field, vol_field])
            print(f"[rating] Successfully updated black player ({game.black.username or game.black.id}) ratings: {black_rating} -> {new_b_r}", file=sys.stderr)
            if mode_key:
                from accounts.models_rating_history import RatingHistory
                RatingHistory.objects.get_or_create(
                    user_id=game.black.id,
                    mode=mode_key,
                    recorded_at=snapshot_time,
                    source="game",
                    defaults={"rating": new_b_r, "date": snapshot_date},
                )
        except Exception as e:
            print(f"[rating] Error updating black player ratings: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

        try:
            game.white_rating_delta = white_delta
            game.black_rating_delta = black_delta
            game.save(update_fields=["white_rating_delta", "black_rating_delta"])
        except Exception:
            pass
        
        print(f"[rating] Rating update complete for game {game.id}", file=sys.stderr)


class AcceptGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_PENDING:
            return Response({"detail": "Game is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")
        if game.created_at:
            expiry_deadline = game.created_at + timedelta(minutes=CHALLENGE_EXPIRY_MINUTES)
            if timezone.now() > expiry_deadline:
                game.status = Game.STATUS_ABORTED
                game.result = Game.RESULT_NONE
                game.finished_at = timezone.now()
                game.save(update_fields=["status", "result", "finished_at"])
                try:
                    from notifications.views import create_notification
                    players = [game.white, game.black]
                    for player in players:
                        if not player:
                            continue
                        opponent = game.black if player == game.white else game.white
                        opponent_name = opponent.username if opponent and opponent.username else (opponent.email if opponent else "opponent")
                        create_notification(
                            user=player,
                            notification_type="challenge_expired",
                            title="Challenge Expired",
                            message=f"Challenge with {opponent_name} expired.",
                            data={
                                "game_id": game.id,
                                "opponent_id": opponent.id if opponent else None,
                                "opponent_username": opponent.username if opponent else None,
                            },
                        )
                except Exception:
                    pass
                # Notify game group about expiry
                try:
                    channel_layer = get_channel_layer()
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
                except Exception:
                    pass
                return Response({"detail": "Challenge expired."}, status=status.HTTP_400_BAD_REQUEST)
        # Block if user has another active game
        other_active = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            (models.Q(white=request.user) | models.Q(black=request.user)) & ~models.Q(id=game.id)
        )
        if other_active.exists():
            return Response({"detail": "You are already in an active game."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Log before starting
        import sys
        print(f"[AcceptGameView] Accepting game {game.id}, current status: {game.status}, user: {request.user.username}", file=sys.stdout)
        
        game.start()
        
        # Refresh from DB to ensure we have the latest status
        game.refresh_from_db()
        print(f"[AcceptGameView] Game {game.id} started, new status: {game.status}", file=sys.stdout)
        
        # Send WebSocket notification to both players that the game has started
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                game_data = GameSerializer(game).data
                # Notify both players via their user channels
                async_to_sync(channel_layer.group_send)(
                    f"user_{game.white.id}",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "game_started",
                            "game_id": game.id,
                            "game": game_data,
                        },
                    },
                )
                async_to_sync(channel_layer.group_send)(
                    f"user_{game.black.id}",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "game_started",
                            "game_id": game.id,
                            "game": game_data,
                        },
                    },
                )
                # Also notify the game group (in case users are already on the game page)
                async_to_sync(channel_layer.group_send)(
                    f"game_{game.id}",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "game_started",
                            "game_id": game.id,
                            "game": game_data,
                        },
                    },
                )
        except Exception as e:
            import sys
            print(f"[AcceptGameView] WebSocket notification error: {e}", file=sys.stderr)
        
        return Response(GameSerializer(game).data)


class AbortGameView(APIView):
    """
    Abort an active game (only allowed if <= 2 moves have been played).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        
        # Check if user is part of this game
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")

        # Allow creator to abort a pending challenge
        if game.status == Game.STATUS_PENDING:
            if request.user != game.creator:
                raise PermissionDenied("Only the creator can abort a pending challenge.")
            game.status = Game.STATUS_ABORTED
            game.finished_at = timezone.now()
            game.result = Game.RESULT_NONE
            game.save(update_fields=["status", "finished_at", "result"])
            try:
                from notifications.views import create_notification
                opponent = game.black if request.user == game.white else game.white
                if opponent:
                    create_notification(
                        user=opponent,
                        notification_type="challenge_aborted",
                        title="Challenge Aborted",
                        message=f"{request.user.username or request.user.email} aborted the challenge.",
                        data={
                            "game_id": game.id,
                            "opponent_id": request.user.id,
                            "opponent_username": request.user.username,
                        },
                    )
            except Exception:
                pass
            channel_layer = get_channel_layer()
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
                            "reason": "challenge_aborted",
                            "game": game_data,
                        },
                    },
                )
            return Response(GameSerializer(game).data)
        
        # Only allow abort for active games
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game must be active to abort."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Count moves (each player move counts as 1, so 2 moves = 1 move each)
        move_count = len((game.moves or "").strip().split()) if game.moves else 0
        
        if move_count > 2:
            return Response({"detail": "Cannot abort game after more than 2 moves."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Abort the game
        game.status = Game.STATUS_ABORTED
        game.finished_at = timezone.now()
        game.result = Game.RESULT_NONE
        game.save(update_fields=["status", "finished_at", "result"])
        
        # Broadcast game update via WebSocket
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "gameState",
                        "status": "aborted",
                        "game": GameSerializer(game).data
                    }
                }
            )
        
        return Response(GameSerializer(game).data)


class RejectGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_PENDING:
            return Response({"detail": "Game is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")
        
        # Determine who rejected and who should be notified
        rejector = request.user
        opponent = game.white if rejector == game.black else game.black
        
        game.status = Game.STATUS_ABORTED
        game.finished_at = timezone.now()
        game.result = Game.RESULT_NONE
        game.save(update_fields=["status", "finished_at", "result"])
        
        # Broadcast rejection to game group
        channel_layer = get_channel_layer()
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
                        "reason": "challenge_rejected",
                        "game": game_data,
                    },
                },
            )
        
        # Send notification to the challenger (opponent) that their challenge was rejected
        if opponent:
            from notifications.views import create_notification
            create_notification(
                user=opponent,
                notification_type='challenge_rejected',
                title='Challenge Rejected',
                message=f"{rejector.username or rejector.email} rejected your challenge",
                data={
                    'game_id': game.id,
                    'rejected_by_id': rejector.id,
                    'rejected_by_username': rejector.username or rejector.email
                },
                expires_in_hours=CHALLENGE_EXPIRY_MINUTES / 60
            )
        
        return Response(GameSerializer(game).data)


class GameAnalysisView(APIView):
    permission_classes = [permissions.AllowAny]  # Allow spectators to view analysis

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        # Check if user is authenticated (for player check)
        is_player = False
        if request.user and not request.user.is_anonymous:
            is_player = game.white == request.user or game.black == request.user
        
        # Only block players from viewing analysis during their own active games
        # Allow spectators and allow players to view finished games
        if is_player and game.status in [Game.STATUS_ACTIVE, Game.STATUS_PENDING]:
            return Response(
                {"detail": "Players cannot view live analysis during an active game."},
                status=status.HTTP_403_FORBIDDEN,
            )

        board = chess.Board(game.current_fen or chess.STARTING_FEN)
        analysis = {
            "legal_moves": [board.san(mv) for mv in board.legal_moves],
            "is_check": board.is_check(),
            "is_checkmate": board.is_checkmate(),
            "is_stalemate": board.is_stalemate(),
            "can_claim_threefold": board.can_claim_threefold_repetition(),
            "can_claim_fifty": board.can_claim_fifty_moves(),
            "castling_rights": {
                "white_king": board.has_kingside_castling_rights(chess.WHITE),
                "white_queen": board.has_queenside_castling_rights(chess.WHITE),
                "black_king": board.has_kingside_castling_rights(chess.BLACK),
                "black_queen": board.has_queenside_castling_rights(chess.BLACK),
            },
        }

        engine_info = None
        engine_source = None

        # Use local Stockfish only (no Lichess API).
        if not engine_info:
            engine_path = get_stockfish_path()
            
            if not engine_path:
                engine_info = {"error": "STOCKFISH_PATH not configured and repo Stockfish not available."}
            else:
                works, message, engine_path = ensure_stockfish_works(engine_path)
                
                if not works:
                    engine_info = {"error": message, "engine_path": engine_path}
                else:
                    try:
                        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                            limit = chess.engine.Limit(time=0.2)
                            result = engine.analyse(board, limit)
                            if result:
                                score = result.get("score")
                                pv = result.get("pv", [])
                                engine_info = {
                                    "best_move": board.san(pv[0]) if pv else None,
                                    "score": score.pov(board.turn).score(mate_score=100000) if score else None,
                                    "mate": score.pov(board.turn).mate() if score else None,
                                    "depth": result.get("depth", 0),
                                }
                                engine_source = "local_stockfish"
                            else:
                                engine_info = {"error": "Stockfish returned no analysis result"}
                    except Exception as exc:
                        engine_info = {
                            "error": str(exc),
                            "error_type": type(exc).__name__,
                            "engine_path": engine_path
                        }
        
        if engine_source:
            engine_info["source"] = engine_source

        return Response(
            {
                "game": GameSerializer(game).data,
                "analysis": analysis,
                "engine": engine_info,
            }
        )


class GameSpectateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active for spectating."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(GameSerializer(game).data)


class GameDrawOfferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user not in [game.white, game.black]:
            raise PermissionDenied("You are not part of this game.")
        game.draw_offer_by = request.user
        game.save(update_fields=["draw_offer_by"])
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {"type": "game.event", "payload": {"type": "draw_offer", "game_id": game.id, "by": request.user.id}},
        )
        return Response({"detail": "Draw offer sent."})


class GameDrawRespondView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user not in [game.white, game.black]:
            raise PermissionDenied("You are not part of this game.")
        decision = request.data.get("decision")
        if decision not in ["accept", "decline"]:
            return Response({"detail": "Invalid decision."}, status=status.HTTP_400_BAD_REQUEST)
        if not game.draw_offer_by or game.draw_offer_by == request.user:
            return Response({"detail": "No pending draw offer from opponent."}, status=status.HTTP_400_BAD_REQUEST)
        if decision == "accept":
            result = Game.RESULT_DRAW
            game.finish(result)
            # Refresh game from database to get updated rated status
            game.refresh_from_db()
            # Update ratings for rated games
            if game.rated:
                # Always update ratings synchronously to ensure they're updated immediately
                FinishGameView().update_ratings(game, result)
            # Broadcast game_finished event for draw
            channel_layer = get_channel_layer()
            game_data = GameSerializer(game).data
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "game_finished",
                        "game_id": game.id,
                        "result": result,
                        "reason": "draw_accepted",
                        "game": game_data,
                    },
                },
            )
        game.draw_offer_by = None
        game.save(update_fields=["draw_offer_by"])
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {"type": "game.event", "payload": {"type": "draw_response", "game_id": game.id, "decision": decision}},
        )
        return Response(GameSerializer(game).data)


class GameResignView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status not in [Game.STATUS_ACTIVE, Game.STATUS_PENDING]:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user == game.white:
            result = Game.RESULT_BLACK
        elif request.user == game.black:
            result = Game.RESULT_WHITE
        else:
            raise PermissionDenied("You are not part of this game.")
        try:
            board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            board = build_board_from_moves(game.moves, game.START_FEN) or chess.Board()
        reason = "resignation"
        if is_insufficient_material(board):
            result = Game.RESULT_DRAW
            reason = "resignation_insufficient_material"
        game.finish(result)
        
        # Refresh game from database to get updated rated status
        game.refresh_from_db()
        
        # Update ratings for rated games
        if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
            # Always update ratings synchronously to ensure they're updated immediately
            FinishGameView().update_ratings(game, result)
        
        channel_layer = get_channel_layer()
        game_data = GameSerializer(game).data
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {"type": "game.event", "payload": {"type": "resign", "game_id": game.id, "by": request.user.id}},
        )
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {
                "type": "game.event",
                "payload": {
                    "type": "game_finished",
                    "game_id": game.id,
                    "result": result,
                    "reason": reason,
                    "game": game_data,
                },
            },
        )
        return Response(GameSerializer(game).data)


class GameClaimDrawView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_ACTIVE:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user not in [game.white, game.black]:
            raise PermissionDenied("You are not part of this game.")
        history_board = build_board_from_moves(game.moves, game.START_FEN)
        if not history_board:
            history_board = chess.Board(game.current_fen or chess.STARTING_FEN)
        try:
            current_board = chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            current_board = history_board
        claimable = (
            history_board.can_claim_fifty_moves()
            or history_board.can_claim_threefold_repetition()
            or is_insufficient_material(current_board)
        )
        if not claimable:
            return Response({"detail": "Draw cannot be claimed now."}, status=status.HTTP_400_BAD_REQUEST)
        result = Game.RESULT_DRAW
        game.finish(result)
        # Refresh game from database to get updated rated status
        game.refresh_from_db()
        # Update ratings for rated games
        if game.rated:
            # Always update ratings synchronously to ensure they're updated immediately
            FinishGameView().update_ratings(game, result)
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {"type": "game.event", "payload": {"type": "claim_draw", "game_id": game.id}},
        )
        return Response(GameSerializer(game).data)


class GameRematchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        original = get_object_or_404(Game, id=pk)
        if original.status not in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response({"detail": "Game must be finished or aborted to rematch."}, status=status.HTTP_400_BAD_REQUEST)
        requester = request.user
        if requester != original.white and requester != original.black:
            raise PermissionDenied("You are not part of this game.")

        opponent = original.black if requester == original.white else original.white

        # Check if either player is in an active game
        active_conflict = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            (models.Q(white=requester) | models.Q(black=requester)) | 
            (models.Q(white=opponent) | models.Q(black=opponent))
        )
        if active_conflict.exists():
            return Response({"detail": "One of the players is already in an active game."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if rematch already requested
        if original.rematch_requested_by:
            if original.rematch_requested_by == requester:
                return Response({"detail": "You have already requested a rematch."}, status=status.HTTP_400_BAD_REQUEST)
            # If opponent already requested, accept it
            return self._accept_rematch(original, requester)

        # If opponent is a bot, automatically accept rematch
        if opponent.is_bot:
            original.rematch_requested_by = requester
            original.save(update_fields=['rematch_requested_by'])
            return self._accept_rematch(original, opponent)

        # Request rematch (don't create game yet)
        original.rematch_requested_by = requester
        original.save(update_fields=['rematch_requested_by'])

        # Send notification to opponent
        from notifications.views import create_notification
        create_notification(
            user=opponent,
            notification_type='rematch_requested',
            title='Rematch Request',
            message=f"{requester.username or requester.email} wants a rematch",
            data={
                'original_game_id': original.id,
                'game_id': original.id,  # Also include game_id for consistency
                'from_user_id': requester.id,
                'from_username': requester.username,
            }
        )

        return Response({
            "status": "rematch_requested",
            "rematch_requested_by": requester.id
        }, status=status.HTTP_200_OK)

    def _accept_rematch(self, original, accepter):
        """Accept rematch and create new game"""
        requester = original.rematch_requested_by
        if not requester:
            return Response({"detail": "No rematch request found."}, status=status.HTTP_400_BAD_REQUEST)

        # Determine new colors (swap)
        new_white = original.black
        new_black = original.white

        # Check again if either is active (race condition)
        active_conflict = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            (models.Q(white=new_white) | models.Q(black=new_white)) | 
            (models.Q(white=new_black) | models.Q(black=new_black))
        )
        if active_conflict.exists():
            return Response({"detail": "One of the players is already in an active game."}, status=status.HTTP_400_BAD_REQUEST)

        game = Game.objects.create(
            creator=requester,
            white=new_white,
            black=new_black,
            time_control=original.time_control,
            rated=original.rated,
            initial_time_seconds=original.initial_time_seconds,
            increment_seconds=original.increment_seconds,
            white_time_seconds=original.white_time_seconds,
            black_time_seconds=original.black_time_seconds,
            white_increment_seconds=original.white_increment_seconds,
            black_increment_seconds=original.black_increment_seconds,
            current_fen=chess.STARTING_FEN,
            rematch_of=original,
        )

        # Clear rematch request
        original.rematch_requested_by = None
        original.save(update_fields=['rematch_requested_by'])

        # Start the game
        game.start()
        
        # If bot is white, make first move automatically
        if game.white.is_bot:
            try:
                mv = GameMoveView()
                mv._make_bot_move(game, game.white)
            except Exception as e:
                import sys
                print(f"[rematch] Error making initial bot move: {e}", file=sys.stderr)

        return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)


class GameRematchAcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        original = get_object_or_404(Game, id=pk)
        if original.status not in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response({"detail": "Game must be finished or aborted."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != original.white and request.user != original.black:
            raise PermissionDenied("You are not part of this game.")
        if not original.rematch_requested_by:
            return Response({"detail": "No rematch request found."}, status=status.HTTP_400_BAD_REQUEST)
        if original.rematch_requested_by == request.user:
            return Response({"detail": "You cannot accept your own rematch request."}, status=status.HTTP_400_BAD_REQUEST)

        requester = original.rematch_requested_by
        opponent = original.black if request.user == original.white else original.white

        # Check if either player is in an active game
        active_conflict = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            (models.Q(white=requester) | models.Q(black=requester)) | 
            (models.Q(white=opponent) | models.Q(black=opponent))
        )
        if active_conflict.exists():
            return Response({"detail": "One of the players is already in an active game."}, status=status.HTTP_400_BAD_REQUEST)

        # Determine new colors (swap)
        new_white = original.black
        new_black = original.white

        game = Game.objects.create(
            creator=requester,
            white=new_white,
            black=new_black,
            time_control=original.time_control,
            rated=original.rated,
            initial_time_seconds=original.initial_time_seconds,
            increment_seconds=original.increment_seconds,
            white_time_seconds=original.white_time_seconds,
            black_time_seconds=original.black_time_seconds,
            white_increment_seconds=original.white_increment_seconds,
            black_increment_seconds=original.black_increment_seconds,
            current_fen=chess.STARTING_FEN,
            rematch_of=original,
        )

        # Clear rematch request
        original.rematch_requested_by = None
        original.save(update_fields=['rematch_requested_by'])

        # Start the game
        game.start()

        # Send WebSocket notifications to both players to redirect them to the new game
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        if channel_layer:
            game_data = GameSerializer(game).data
            # Notify both players via their user channels
            for player in [requester, opponent]:
                async_to_sync(channel_layer.group_send)(
                    f"user_{player.id}",
                    {
                        "type": "game.event",
                        "payload": {
                            "type": "rematch_accepted",
                            "game_id": game.id,
                            "game": game_data,
                        },
                    },
                )
            # Also notify the game group (in case users are still on the old game page)
            async_to_sync(channel_layer.group_send)(
                f"game_{original.id}",
                {
                    "type": "game.event",
                    "payload": {
                        "type": "rematch_accepted",
                        "game_id": game.id,
                        "game": game_data,
                    },
                },
            )

        return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)


class GameRematchRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        original = get_object_or_404(Game, id=pk)
        if original.status not in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response({"detail": "Game must be finished or aborted."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != original.white and request.user != original.black:
            raise PermissionDenied("You are not part of this game.")
        if not original.rematch_requested_by:
            return Response({"detail": "No rematch request found."}, status=status.HTTP_400_BAD_REQUEST)

        # Clear rematch request
        original.rematch_requested_by = None
        original.save(update_fields=['rematch_requested_by'])

        return Response({"status": "rematch_rejected"}, status=status.HTTP_200_OK)


class GamePlayerStatusView(APIView):
    """Check if players are in active games"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")
        
        opponent = game.black if request.user == game.white else game.white
        
        # Check if either player is in an active game
        white_active = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            models.Q(white=game.white) | models.Q(black=game.white)
        ).exclude(id=game.id).exists()
        
        black_active = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            models.Q(white=game.black) | models.Q(black=game.black)
        ).exclude(id=game.id).exists()
        
        return Response({
            "white_in_active_game": white_active,
            "black_in_active_game": black_active,
            "rematch_requested_by": game.rematch_requested_by.id if game.rematch_requested_by else None
        })
        if game.status != Game.STATUS_PENDING:
            return Response({"detail": "Game is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")
        game.status = Game.STATUS_ABORTED
        game.finished_at = timezone.now()
        game.save(update_fields=["status", "finished_at"])
        return Response(GameSerializer(game).data)
