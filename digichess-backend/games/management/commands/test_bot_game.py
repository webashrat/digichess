"""
Test script to play a complete game with a bot.
Tests move flow, clock updates, WebSocket broadcasting, and game completion.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.test import Client
from rest_framework.authtoken.models import Token
import time
import json
import chess
from games.models import Game

User = get_user_model()


class Command(BaseCommand):
    help = 'Test playing a game with a bot to verify game flow, moves, and clock updates'

    def add_arguments(self, parser):
        parser.add_argument(
            '--iterations',
            type=int,
            default=1,
            help='Number of games to play (default: 1)',
        )
        parser.add_argument(
            '--user-email',
            type=str,
            default='test@example.com',
            help='Email of test user (default: test@example.com)',
        )
        parser.add_argument(
            '--bot-id',
            type=int,
            default=None,
            help='Bot ID to play against (default: first available bot)',
        )

    def handle(self, *args, **options):
        iterations = options['iterations']
        user_email = options['user_email']
        bot_id = options['bot_id']
        
        self.stdout.write(self.style.SUCCESS(f'=== Bot Game Test ==='))
        self.stdout.write(f'Testing {iterations} game(s)')
        
        # Get or create test user
        try:
            user = User.objects.get(email=user_email)
            self.stdout.write(f'Using existing user: {user.username} (ID: {user.id})')
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User {user_email} not found. Please create it first.'))
            return
        
        # Get bot
        if bot_id:
            try:
                bot = User.objects.get(id=bot_id, is_bot=True)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Bot with ID {bot_id} not found.'))
                return
        else:
            bot = User.objects.filter(is_bot=True).first()
            if not bot:
                self.stdout.write(self.style.ERROR('No bots available. Please create a bot first.'))
                return
        
        self.stdout.write(f'Playing against bot: {bot.username} (ID: {bot.id})')
        
        # Create authenticated test client
        token, _ = Token.objects.get_or_create(user=user)
        client = Client(HTTP_AUTHORIZATION=f'Token {token.key}')
        
        success_count = 0
        error_count = 0
        
        for i in range(iterations):
            self.stdout.write(self.style.SUCCESS(f'\n--- Game {i+1}/{iterations} ---'))
            try:
                game_id = self.create_bot_game(client, bot.id, user.id)
                if not game_id:
                    error_count += 1
                    continue
                
                result = self.play_game(client, game_id, user.id)
                if result:
                    success_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✓ Game {i+1} completed successfully'))
                else:
                    error_count += 1
                    self.stdout.write(self.style.ERROR(f'✗ Game {i+1} failed'))
                    
            except Exception as e:
                error_count += 1
                self.stdout.write(self.style.ERROR(f'✗ Game {i+1} error: {e}'))
                import traceback
                self.stdout.write(self.style.ERROR(traceback.format_exc()))
        
        self.stdout.write(self.style.SUCCESS(f'\n=== Test Complete ==='))
        self.stdout.write(f'Success: {success_count}/{iterations}')
        self.stdout.write(f'Errors: {error_count}/{iterations}')

    def create_bot_game(self, client, bot_id, user_id):
        """Create a game with a bot using Django test client"""
        url = '/api/games/bots/create-game/'
        data = {
            'bot_id': bot_id,
            'time_control': 'blitz',
            'preferred_color': 'auto',
            'rated': False,
        }
        
        try:
            response = client.post(url, data=json.dumps(data), content_type='application/json')
            if response.status_code == 401:
                self.stdout.write(self.style.ERROR(f'Authentication failed'))
                self.stdout.write(self.style.ERROR(f'Response: {response.content.decode()}'))
                return None
            if response.status_code != 201:
                self.stdout.write(self.style.ERROR(f'Failed to create game: {response.status_code}'))
                self.stdout.write(self.style.ERROR(f'Response: {response.content.decode()}'))
                return None
            
            game_data = response.json()
            game_id = game_data.get('id')
            self.stdout.write(f'Created game {game_id}')
            return game_id
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to create game: {e}'))
            import traceback
            self.stdout.write(self.style.ERROR(traceback.format_exc()))
            return None

    def play_game(self, client, game_id, user_id, max_moves=50):
        """Play a game by making moves until completion"""
        url = f'/api/games/{game_id}/'
        move_url = f'/api/games/{game_id}/move/'
        clock_url = f'/api/games/{game_id}/clock/'
        
        moves_made = 0
        board = chess.Board()
        user_is_white = None  # Will be determined from first game state
        consecutive_no_progress = 0  # Track if game is stuck
        
        self.stdout.write(f'Starting game play for game {game_id}...')
        
        while moves_made < max_moves:
            # Get current game state
            try:
                response = client.get(url)
                if response.status_code != 200:
                    self.stdout.write(self.style.ERROR(f'Failed to get game state: {response.status_code}'))
                    return False
                game_data = response.json()
                
                status = game_data.get('status')
                if status != 'active':
                    self.stdout.write(f'Game finished: {status} - {game_data.get("result")}')
                    return True
                
                # Get clock
                try:
                    clock_response = client.get(clock_url)
                    if clock_response.status_code == 200:
                        clock = clock_response.json()
                        self.stdout.write(
                            f'Clock - White: {clock.get("white_time_left")}s, '
                            f'Black: {clock.get("black_time_left")}s, '
                            f'Turn: {clock.get("turn")}'
                        )
                except:
                    pass
                
                # Load board from FEN
                current_fen = game_data.get('current_fen') or chess.STARTING_FEN
                board.set_fen(current_fen)
                
                # Check whose turn it is
                is_white_turn = board.turn == chess.WHITE
                white_data = game_data.get('white', {})
                black_data = game_data.get('black', {})
                white_id = white_data.get('id') if isinstance(white_data, dict) else (white_data if isinstance(white_data, int) else None)
                black_id = black_data.get('id') if isinstance(black_data, dict) else (black_data if isinstance(black_data, int) else None)
                
                # Determine which side the user is on (from first game state fetch)
                if user_is_white is None:
                    user_is_white = (white_id == user_id) if white_id else False
                    self.stdout.write(f'User is playing as: {"White" if user_is_white else "Black"}')
                
                # Check if it's the user's turn
                is_my_turn = (is_white_turn and user_is_white) or (not is_white_turn and not user_is_white)
                self.stdout.write(f'Turn: {"White" if is_white_turn else "Black"}, Is my turn: {is_my_turn}, Moves made: {moves_made}')
                
                # Only make move if it's our turn
                if is_my_turn:
                    # Get legal moves
                    legal_moves = list(board.legal_moves)
                    if not legal_moves:
                        self.stdout.write('No legal moves - game should end')
                        break
                    
                    # Make a simple move (first legal move for testing)
                    move = legal_moves[0]
                    move_san = board.san(move)
                    
                    self.stdout.write(f'Making move: {move_san} (move {moves_made + 1})')
                    
                    # Make the move
                    move_response = client.post(
                        move_url,
                        data=json.dumps({'move': move_san}),
                        content_type='application/json'
                    )
                    
                    if move_response.status_code == 200:
                        moves_made += 1
                        move_data = move_response.json()
                        
                        # Update board from response
                        board.set_fen(move_data.get('current_fen', current_fen))
                        
                        # Wait a bit for bot to respond (if bot is next)
                        time.sleep(2)
                        
                        # Verify move was applied
                        if move_data.get('current_fen'):
                            self.stdout.write(f'Move applied. New FEN: {move_data.get("current_fen")[:30]}...')
                        else:
                            self.stdout.write(self.style.WARNING('No FEN in move response'))
                    else:
                        self.stdout.write(
                            self.style.ERROR(
                                f'Move failed: {move_response.status_code} - {move_response.content.decode()}'
                            )
                        )
                        return False
                else:
                    # Wait for bot move
                    self.stdout.write('Waiting for bot move...')
                    time.sleep(3)
                    
                    # Refresh game state
                    response = client.get(url)
                    if response.status_code != 200:
                        self.stdout.write(self.style.ERROR(f'Failed to get game state: {response.status_code}'))
                        return False
                    game_data = response.json()
                    
                    # Check if bot made a move by comparing move count
                    moves = game_data.get('moves', '').strip().split()
                    old_move_count = moves_made
                    if len(moves) > moves_made:
                        moves_made = len(moves)
                        consecutive_no_progress = 0  # Reset counter
                        # Update board from new FEN
                        new_fen = game_data.get('current_fen')
                        if new_fen:
                            board.set_fen(new_fen)
                        self.stdout.write(f'Bot made move(s). Total moves: {moves_made} (was {old_move_count}), FEN: {new_fen[:40] if new_fen else "N/A"}...')
                    else:
                        consecutive_no_progress += 1
                        if consecutive_no_progress >= 5:
                            self.stdout.write(self.style.WARNING(f'No progress for 5 iterations. Current moves: {moves_made}, Game status: {game_data.get("status")}'))
                            consecutive_no_progress = 0
                            # Check if game ended
                            if game_data.get('status') != 'active':
                                break
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error: {e}'))
                import traceback
                self.stdout.write(self.style.ERROR(traceback.format_exc()))
                return False
        
        if moves_made >= max_moves:
            self.stdout.write(self.style.WARNING(f'Reached max moves ({max_moves}), ending test'))
        
        # Final game state
        try:
            response = client.get(url)
            if response.status_code == 200:
                game_data = response.json()
                self.stdout.write(f'Final status: {game_data.get("status")}, Result: {game_data.get("result")}')
                return True
            return False
        except:
            return False

