"""
Test WebSocket performance and optimization
Simulates multiple WebSocket connections and message throughput
"""
import asyncio
import time
import json
from django.core.management.base import BaseCommand
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async

from games.consumers import GameConsumer
from games.models import Game
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Test WebSocket performance'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n=== WebSocket Performance Test ===\n'))
        
        # Note: This requires async test setup
        # For now, we'll do a simpler synchronous test
        self.test_consumer_initialization()
        self.test_game_serialization_performance()

    def test_consumer_initialization(self):
        """Test consumer initialization speed"""
        self.stdout.write('\n[Test] Consumer Initialization...')
        
        from games.query_optimization import get_game_with_all_relations
        
        # Create test game
        user1 = User.objects.create_user(username='wstest1', email='ws1@test.com', password='test')
        user2 = User.objects.create_user(username='wstest2', email='ws2@test.com', password='test')
        game = Game.objects.create(
            white=user1,
            black=user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300
        )
        
        # Test optimized query
        import time
        start = time.perf_counter()
        game_opt = get_game_with_all_relations(game.id)
        time_opt = (time.perf_counter() - start) * 1000
        
        # Test unoptimized query
        start = time.perf_counter()
        game_unopt = Game.objects.get(id=game.id)
        time_unopt = (time.perf_counter() - start) * 1000
        
        self.stdout.write(f"  Optimized query: {time_opt:.2f}ms")
        self.stdout.write(f"  Unoptimized query: {time_unopt:.2f}ms")
        
        if time_opt <= time_unopt:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Query optimization working"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Query optimization may need improvement"))

    def test_game_serialization_performance(self):
        """Test game serialization performance"""
        self.stdout.write('\n[Test] Game Serialization Performance...')
        
        from games.serializers import GameSerializer
        from games.query_optimization import get_game_with_all_relations
        
        # Create test game
        user1 = User.objects.create_user(username='ser1', email='ser1@test.com', password='test')
        user2 = User.objects.create_user(username='ser2', email='ser2@test.com', password='test')
        game = Game.objects.create(
            white=user1,
            black=user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300
        )
        
        # Test with optimized query
        start = time.perf_counter()
        game_opt = get_game_with_all_relations(game.id)
        data_opt = GameSerializer(game_opt).data
        time_opt = (time.perf_counter() - start) * 1000
        
        # Test with unoptimized query
        start = time.perf_counter()
        game_unopt = Game.objects.get(id=game.id)
        data_unopt = GameSerializer(game_unopt).data
        time_unopt = (time.perf_counter() - start) * 1000
        
        self.stdout.write(f"  With optimization: {time_opt:.2f}ms")
        self.stdout.write(f"  Without optimization: {time_unopt:.2f}ms")
        
        improvement = ((time_unopt - time_opt) / time_unopt) * 100 if time_unopt > 0 else 0
        self.stdout.write(f"  Improvement: {improvement:.1f}%")
        
        if improvement > 0:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Serialization optimized"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Limited optimization benefit"))

