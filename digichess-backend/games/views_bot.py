"""
Views for bot games
"""
from django.shortcuts import get_object_or_404
from django.db import models
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from accounts.models import User
from .models import Game
from .serializers import GameSerializer


class BotListView(APIView):
    """List all available bots"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request):
        mode = request.query_params.get('mode', 'blitz')
        rating_field_map = {
            'bullet': 'rating_bullet',
            'blitz': 'rating_blitz',
            'rapid': 'rating_rapid',
            'classical': 'rating_classical',
        }
        rating_field = rating_field_map.get(mode, 'rating_blitz')
        
        # Only show DIGI, JDR, and RAJ bots
        allowed_bot_names = ['DIGI', 'JDR', 'RAJ']
        bots = User.objects.filter(
            is_bot=True, 
            is_active=True,
            first_name__in=allowed_bot_names
        ).order_by(rating_field)
        
        bot_list = []
        for bot in bots:
            rating = getattr(bot, rating_field, 800)
            bot_list.append({
                'id': bot.id,
                'username': bot.username,
                'first_name': bot.first_name,
                'bot_avatar': bot.bot_avatar or '🤖',
                'rating': rating,
                'mode': mode,
            })
        
        return Response({'bots': bot_list})


class CreateBotGameView(APIView):
    """Create a game against a bot"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        bot_id = request.data.get('bot_id')
        time_control = request.data.get('time_control', Game.TIME_BLITZ)
        preferred_color = request.data.get('preferred_color', 'auto')
        rated = request.data.get('rated', False)  # Bot games are usually unrated
        
        if not bot_id:
            return Response({"detail": "bot_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            bot = User.objects.get(id=bot_id, is_bot=True, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Bot not found"}, status=status.HTTP_404_NOT_FOUND)
        
        # Check if user has another active game
        other_active = Game.objects.filter(
            status=Game.STATUS_ACTIVE
        ).filter(
            models.Q(white=request.user) | models.Q(black=request.user)
        )
        if other_active.exists():
            return Response({"detail": "You are already in an active game."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Determine colors
        if preferred_color not in {'white', 'black', 'auto'}:
            preferred_color = 'auto'
        if preferred_color == 'white':
            white = request.user
            black = bot
        elif preferred_color == 'black':
            white = bot
            black = request.user
        else:  # auto
            # Randomly assign colors
            import random
            if random.random() < 0.5:
                white = request.user
                black = bot
            else:
                white = bot
                black = request.user
        
        # Get time defaults
        from .serializers import TIME_DEFAULTS
        default_time, default_inc = TIME_DEFAULTS.get(time_control, (180, 0))
        
        # Create game
        game = Game.objects.create(
            creator=request.user,
            white=white,
            black=black,
            time_control=time_control,
            white_time_left=default_time,
            black_time_left=default_time,
            white_increment_seconds=default_inc,
            black_increment_seconds=default_inc,
            rated=rated,
            status=Game.STATUS_PENDING,
        )
        
        # Auto-start the game if it's a bot game
        game.start()
        
        # If bot is white, make first move automatically
        if white.is_bot:
            from games.views import GameMoveView
            try:
                mv = GameMoveView()
                mv._make_bot_move(game, white)
            except Exception as e:
                import sys
                print(f"[bot_game] Error making initial bot move: {e}", file=sys.stderr)
        
        return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)

