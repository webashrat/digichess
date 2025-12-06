from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import models
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
from .stockfish_utils import ensure_stockfish_works, get_stockfish_path
from .lichess_api import analyze_position_with_lichess, get_cloud_evaluation


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

    def _make_bot_move(self, game: Game, bot_player):
        """Make a move for a bot player synchronously"""
        from games.bot_utils import get_bot_move_with_error
        from django.utils import timezone
        
        # Reload game from DB to get latest state
        game.refresh_from_db()
        
        # Check if game is still active
        if game.status != Game.STATUS_ACTIVE:
            return
        
        # Load board
        board = self._load_board(game)
        
        # Verify it's the bot's turn
        current_player = game.white if board.turn == chess.WHITE else game.black
        if current_player != bot_player or not bot_player.is_bot:
            return
        
        # Get bot rating for the current time control
        rating_field_map = {
            Game.TIME_BULLET: 'rating_bullet',
            Game.TIME_BLITZ: 'rating_blitz',
            Game.TIME_RAPID: 'rating_rapid',
            Game.TIME_CLASSICAL: 'rating_classical',
        }
        rating_field = rating_field_map.get(game.time_control, 'rating_blitz')
        bot_rating = getattr(bot_player, rating_field, 800)
        
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
        except Exception as e:
            import sys
            print(f"[bot_move] Error getting bot move: {e}", file=sys.stderr)
            return
        
        # Make the move using the same logic as post()
        now = timezone.now()
        board.push(bot_move)
        
        if game.status == Game.STATUS_PENDING:
            game.start()
        
        move_list = (game.moves or "").strip().split()
        move_list.append(move_san)
        game.moves = " ".join(move_list)
        game.current_fen = board.fen()
        
        # Clock handling
        elapsed = 0
        if game.last_move_at:
            elapsed = (now - game.last_move_at).total_seconds()
        
        is_white_move = (len(move_list) % 2) == 1
        if game.last_move_at:
            if is_white_move:
                game.white_time_left -= int(elapsed)
                if game.white_time_left <= 0:
                    result = Game.RESULT_BLACK
                    game.finish(result)
                    game.refresh_from_db()
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event for timeout
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
                                "reason": "timeout",
                                "game": game_data,
                            },
                        },
                    )
            else:
                game.black_time_left -= int(elapsed)
                if game.black_time_left <= 0:
                    result = Game.RESULT_WHITE
                    game.finish(result)
                    game.refresh_from_db()
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event for timeout
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
                                "reason": "timeout",
                                "game": game_data,
                            },
                        },
                    )
        
        # Apply increment
        if game.status == Game.STATUS_ACTIVE:
            if is_white_move:
                game.white_time_left += game.white_increment_seconds
            else:
                game.black_time_left += game.black_increment_seconds
            game.last_move_at = now
            game.save(update_fields=["moves", "current_fen", "white_time_left", "black_time_left", "last_move_at", "status"])
            self._update_result(game, board)
        else:
            game.last_move_at = now
            game.save(update_fields=["moves", "current_fen", "white_time_left", "black_time_left", "last_move_at", "status"])
        
        # Broadcast move
        channel_layer = get_channel_layer()
        try:
            r = get_redis()
            turn = "white" if board.turn is chess.WHITE else "black"
            r.hset(
                f"game:clock:{game.id}",
                mapping={
                    "white_time_left": game.white_time_left,
                    "black_time_left": game.black_time_left,
                    "last_move_at": int(now.timestamp()),
                    "turn": turn,
                },
            )
        except Exception:
            pass
        
        # Include legal moves and game state for instant interactivity (like Lichess)
        legal_moves = []
        game_state = {}
        try:
            legal_moves = [board.san(mv) for mv in board.legal_moves]
            
            # Get full game state for smooth reconnection (like Lichess gameState)
            from games.lichess_game_flow import get_game_state_export
            game_state = get_game_state_export(game.current_fen, game.moves) or {}
        except Exception:
            pass
        
        # Broadcast move with full state (like Lichess does)
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {
                "type": "game.event",
                "payload": {
                    "type": "gameState",  # Lichess-compatible type
                    "game_id": game.id,
                    "san": move_san,
                    "fen": game.current_fen,
                    "moves": game.moves,
                    "white_time_left": game.white_time_left,
                    "black_time_left": game.black_time_left,
                    "legal_moves": legal_moves,  # Include legal moves for instant board interactivity
                    "game_state": game_state,  # Full game state for smooth updates
                    "last_move_at": int(game.last_move_at.timestamp()) if game.last_move_at else None,
                    "status": game.status,
                    "result": game.result,
                },
            },
        )
        
        # If next player is also a bot, make another move (with small delay)
        if game.status == Game.STATUS_ACTIVE:
            game.refresh_from_db()
            board = self._load_board(game)
            next_player = game.white if board.turn == chess.WHITE else game.black
            if next_player and next_player.is_bot:
                # Small delay to allow UI to update and WebSocket to propagate
                import time
                time.sleep(0.5)  # Increased delay to ensure WebSocket message is sent
                self._make_bot_move(game, next_player)

    def _load_board(self, game: Game) -> chess.Board:
        try:
            return chess.Board(game.current_fen or chess.STARTING_FEN)
        except Exception:
            return chess.Board()

    def _parse_move(self, board: chess.Board, move_str: str) -> chess.Move:
        # Try SAN then UCI
        try:
            return board.parse_san(move_str)
        except Exception:
            try:
                return board.parse_uci(move_str)
            except Exception:
                raise permissions.ValidationError("Invalid move notation.")

    def _update_result(self, game: Game, board: chess.Board):
        result = None
        reason = None
        
        if board.is_checkmate():
            # The side that just moved delivered mate; side to move is losing
            winner_is_white = board.turn is chess.BLACK
            result = Game.RESULT_WHITE if winner_is_white else Game.RESULT_BLACK
            reason = 'checkmate'
            game.finish(result)
        elif board.is_stalemate():
            result = Game.RESULT_DRAW
            reason = 'stalemate'
            game.finish(result)
        elif board.can_claim_threefold_repetition():
            result = Game.RESULT_DRAW
            reason = 'threefold_repetition'
            game.finish(result)
        elif board.is_insufficient_material():
            result = Game.RESULT_DRAW
            reason = 'insufficient_material'
            game.finish(result)
        elif board.can_claim_fifty_moves():
            # Treat as draw claimable
            result = Game.RESULT_DRAW
            reason = 'fifty_moves'
            game.finish(result)
        else:
            game.save(update_fields=["current_fen", "moves"])
            return
        
        # Refresh game from database to get updated rated status
        game.refresh_from_db()
        
        # Update ratings for rated games when game finishes
        if result and game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
            # Always update ratings synchronously to ensure they're updated immediately
            # Celery tasks can be unreliable if not configured properly
            FinishGameView().update_ratings(game, result)
        
        # Broadcast game_finished event
        if result:
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
                        "reason": reason,
                        "game": game_data,
                    },
                },
            )

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.white != request.user and game.black != request.user:
            raise PermissionDenied("You are not part of this game.")
        if game.status in [Game.STATUS_FINISHED, Game.STATUS_ABORTED]:
            return Response({"detail": "Game is not active."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        board = self._load_board(game)
        now = timezone.now()

        # Clock handling
        elapsed = 0
        if game.last_move_at:
            elapsed = (now - game.last_move_at).total_seconds()

        # Fast move validation using Lichess game flow utilities
        move_san = serializer.validated_data["move"]
        from games.lichess_game_flow import validate_move_fast
        
        is_valid, error_msg, move = validate_move_fast(board, move_san)
        if not is_valid or not move:
            return Response({"detail": error_msg or "Illegal move."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Move is valid, proceed
        # move_san is already in SAN format (from validate_move_fast or input)
        # Use it directly, but also get from move object for consistency
        try:
            san = board.san(move)  # Ensure we have correct SAN
        except Exception:
            san = move_san  # Fallback to input
        board.push(move)

        if game.status == Game.STATUS_PENDING:
            game.start()
        move_list = (game.moves or "").strip().split()
        move_list.append(san)
        game.moves = " ".join(move_list)
        game.current_fen = board.fen()
        # Deduct time
        is_white_move = (len(move_list) % 2) == 1  # after push, move count odd means white just moved
        if game.last_move_at:
            if is_white_move:
                game.white_time_left -= int(elapsed)
                if game.white_time_left <= 0:
                    result = Game.RESULT_BLACK
                    game.finish(result)
                    # Refresh game from database to get updated rated status
                    game.refresh_from_db()
                    # Update ratings for rated games
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event for timeout
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
                                "reason": "timeout",
                                "game": game_data,
                            },
                        },
                    )
            else:
                game.black_time_left -= int(elapsed)
                if game.black_time_left <= 0:
                    result = Game.RESULT_WHITE
                    game.finish(result)
                    # Refresh game from database to get updated rated status
                    game.refresh_from_db()
                    # Update ratings for rated games
                    if game.rated and result in {Game.RESULT_WHITE, Game.RESULT_BLACK, Game.RESULT_DRAW}:
                        # Always update ratings synchronously to ensure they're updated immediately
                        FinishGameView().update_ratings(game, result)
                    # Broadcast game_finished event for timeout
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
                                "reason": "timeout",
                                "game": game_data,
                            },
                        },
                    )
        # Apply increment to mover if still active
        if game.status == Game.STATUS_ACTIVE:
            if is_white_move:
                game.white_time_left += game.white_increment_seconds
            else:
                game.black_time_left += game.black_increment_seconds
            game.last_move_at = now
            game.save(update_fields=["moves", "current_fen", "white_time_left", "black_time_left", "last_move_at"])
            self._update_result(game, board)
        else:
            game.last_move_at = now
            game.save(update_fields=["moves", "current_fen", "white_time_left", "black_time_left", "last_move_at"])
        data = GameSerializer(game).data
        # Broadcast to WS group
        channel_layer = get_channel_layer()
        # Store clocks in Redis for quick reads
        try:
            r = get_redis()
            turn = "white" if board.turn is chess.WHITE else "black"
            r.hset(
                f"game:clock:{game.id}",
                mapping={
                    "white_time_left": game.white_time_left,
                    "black_time_left": game.black_time_left,
                    "last_move_at": int(now.timestamp()),
                    "turn": turn,
                },
            )
        except Exception:
            pass
        async_to_sync(channel_layer.group_send)(
            f"game_{game.id}",
            {
                "type": "game.event",
                "payload": {
                    "type": "move",
                    "game_id": game.id,
                    "san": san,
                    "fen": game.current_fen,
                    "moves": game.moves,
                    "white_time_left": game.white_time_left,
                    "black_time_left": game.black_time_left,
                },
            },
        )
        
        # Check if opponent is a bot and make bot move automatically
        if game.status == Game.STATUS_ACTIVE:
            # Determine if the next player is a bot
            next_player = game.white if board.turn == chess.WHITE else game.black
            if next_player and next_player.is_bot:
                # Make bot move synchronously (immediate)
                try:
                    self._make_bot_move(game, next_player)
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
        
        # Update and save white player ratings
        try:
            setattr(game.white, r_field, new_w_r)
            setattr(game.white, rd_field, new_w_rd)
            setattr(game.white, vol_field, new_w_vol)
            game.white.save(update_fields=[r_field, rd_field, vol_field])
            print(f"[rating] Successfully updated white player ({game.white.username or game.white.id}) ratings: {white_rating} -> {new_w_r}", file=sys.stderr)
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
        except Exception as e:
            print(f"[rating] Error updating black player ratings: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        print(f"[rating] Rating update complete for game {game.id}", file=sys.stderr)


class AcceptGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        if game.status != Game.STATUS_PENDING:
            return Response({"detail": "Game is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user != game.white and request.user != game.black:
            raise PermissionDenied("You are not part of this game.")
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
        game.save(update_fields=["status", "finished_at"])
        
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
                }
            )
        
        return Response(GameSerializer(game).data)


class GameAnalysisView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        game = get_object_or_404(Game, id=pk)
        is_player = game.white == request.user or game.black == request.user
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
        
        # Try Lichess API first (faster, free, no local setup)
        try:
            lichess_result = analyze_position_with_lichess(board, depth=18)
            if lichess_result:
                best_move_san = lichess_result.get("best_move")
                if best_move_san:
                    # Convert UCI to SAN if needed
                    try:
                        move_obj = chess.Move.from_uci(best_move_san)
                        if move_obj in board.legal_moves:
                            best_move_san = board.san(move_obj)
                    except Exception:
                        pass  # Already SAN or can't convert
                
                engine_info = {
                    "best_move": best_move_san,
                    "score": lichess_result.get("evaluation"),  # Centipawns
                    "mate": lichess_result.get("mate"),
                    "depth": lichess_result.get("depth", 0),
                    "pv": lichess_result.get("pv", []),
                    "knodes": lichess_result.get("knodes", 0)
                }
                engine_source = "lichess_cloud"
        except Exception:
            pass  # Fall through to local Stockfish
        
        # Fallback to local Stockfish if Lichess fails
        if not engine_info:
            engine_path = get_stockfish_path()
            
            if not engine_path:
                engine_info = {"error": "STOCKFISH_PATH not configured and repo Stockfish not available."}
            else:
                works, message = ensure_stockfish_works(engine_path)
                
                if not works:
                    engine_info = {"error": message, "engine_path": engine_path}
                else:
                    try:
                        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                            limit = chess.engine.Limit(time=0.5)
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
            game.finish(result)
        elif request.user == game.black:
            result = Game.RESULT_WHITE
            game.finish(result)
        else:
            raise PermissionDenied("You are not part of this game.")
        
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
                    "reason": "resignation",
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
        board = chess.Board(game.current_fen or chess.STARTING_FEN)
        claimable = board.can_claim_fifty_moves() or board.can_claim_threefold_repetition() or board.is_insufficient_material()
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
