"""
Management command to test backend performance optimizations
Run with: python manage.py test_performance
"""
import time
import chess
from django.core.management.base import BaseCommand
from django.db import connection, reset_queries
from django.core.cache import cache
from django.contrib.auth import get_user_model

from games.models import Game
from games.game_proxy import GameProxy
from games.move_optimizer import process_move_optimized, latency_monitor
from games.query_optimization import get_game_with_all_relations

User = get_user_model()


class Command(BaseCommand):
    help = 'Test backend performance optimizations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--iterations',
            type=int,
            default=100,
            help='Number of iterations for performance tests (default: 100)',
        )

    def handle(self, *args, **options):
        iterations = options['iterations']
        
        self.stdout.write(self.style.SUCCESS('\n=== DigiChess Performance Test ===\n'))
        
        # Clear cache
        cache.clear()
        
        # Test 1: GameProxy Caching
        self.test_game_proxy_caching()
        
        # Test 2: Move Processing Speed
        self.test_move_processing(iterations)
        
        # Test 3: Query Optimization
        self.test_query_optimization()
        
        # Test 4: Batched Writes
        self.test_batched_writes(iterations)
        
        # Test 5: Full Game Flow
        self.test_full_game_flow()
        
        # Summary
        self.stdout.write(self.style.SUCCESS('\n=== Performance Test Complete ===\n'))

    def test_game_proxy_caching(self):
        """Test GameProxy caching performance"""
        self.stdout.write('\n[Test 1] GameProxy Caching...')
        
        # Create test game
        user1 = User.objects.create_user(username='perf_test_1', email='pt1@test.com', password='test')
        user2 = User.objects.create_user(username='perf_test_2', email='pt2@test.com', password='test')
        game = Game.objects.create(
            creator=user1,
            white=user1,
            black=user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300
        )
        
        # First access (cache miss)
        start = time.perf_counter()
        reset_queries()
        game1 = GameProxy.get_game(game.id)
        time1 = (time.perf_counter() - start) * 1000
        queries1 = len(connection.queries)
        
        # Second access (should benefit from cache)
        start = time.perf_counter()
        reset_queries()
        game2 = GameProxy.get_game(game.id)
        time2 = (time.perf_counter() - start) * 1000
        queries2 = len(connection.queries)
        
        self.stdout.write(f"  First access: {time1:.2f}ms, {queries1} queries")
        self.stdout.write(f"  Second access: {time2:.2f}ms, {queries2} queries")
        
        if time2 < time1:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Cache working: {((time1-time2)/time1*100):.1f}% faster"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Cache benefit minimal"))

    def test_move_processing(self, iterations):
        """Test move processing speed"""
        self.stdout.write(f'\n[Test 2] Move Processing Speed ({iterations} iterations)...')
        
        board = chess.Board()
        test_moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']
        
        total_time = 0
        total_moves = 0
        
        for i in range(iterations):
            board = chess.Board()  # Reset board
            for move_str in test_moves:
                start = time.perf_counter()
                success, error, move, data = process_move_optimized(None, move_str, board)
                elapsed = (time.perf_counter() - start) * 1000
                total_time += elapsed
                total_moves += 1
        
        avg_time = total_time / total_moves
        
        self.stdout.write(f"  Processed {total_moves} moves in {total_time:.2f}ms")
        self.stdout.write(f"  Average: {avg_time:.2f}ms per move")
        self.stdout.write(f"  Target: <50ms per move")
        
        if avg_time < 50:
            self.stdout.write(self.style.SUCCESS(f"  ✓ FAST: {avg_time:.2f}ms (target: <50ms)"))
        elif avg_time < 100:
            self.stdout.write(self.style.WARNING(f"  ⚠ ACCEPTABLE: {avg_time:.2f}ms (target: <50ms)"))
        else:
            self.stdout.write(self.style.ERROR(f"  ✗ SLOW: {avg_time:.2f}ms (target: <50ms)"))
        
        # Show latency monitor stats
        avg_latency = latency_monitor.average()
        self.stdout.write(f"  Latency monitor average: {avg_latency:.2f}ms")

    def test_query_optimization(self):
        """Test query optimization (N+1 elimination)"""
        self.stdout.write('\n[Test 3] Query Optimization (N+1 Elimination)...')
        
        # Create test data
        users = []
        for i in range(10):
            user = User.objects.create_user(
                username=f'qtest_{i}',
                email=f'qt{i}@test.com',
                password='test'
            )
            users.append(user)
        
        games = []
        for i in range(10):
            game = Game.objects.create(
                creator=users[i % len(users)],
                white=users[i % len(users)],
                black=users[(i + 1) % len(users)],
                time_control=Game.TIME_BLITZ,
                white_time_left=300,
                black_time_left=300
            )
            games.append(game)
        
        # Without optimization
        reset_queries()
        start = time.perf_counter()
        games_unopt = list(Game.objects.all())
        for game in games_unopt:
            _ = game.white.username
            _ = game.black.username
        time_unopt = (time.perf_counter() - start) * 1000
        queries_unopt = len(connection.queries)
        
        # With optimization
        reset_queries()
        start = time.perf_counter()
        games_opt = list(Game.objects.select_related('white', 'black').all())
        for game in games_opt:
            _ = game.white.username
            _ = game.black.username
        time_opt = (time.perf_counter() - start) * 1000
        queries_opt = len(connection.queries)
        
        query_reduction = ((queries_unopt - queries_opt) / queries_unopt) * 100
        time_improvement = ((time_unopt - time_opt) / time_unopt) * 100
        
        self.stdout.write(f"  Without optimization: {time_unopt:.2f}ms, {queries_unopt} queries")
        self.stdout.write(f"  With optimization: {time_opt:.2f}ms, {queries_opt} queries")
        self.stdout.write(f"  Query reduction: {query_reduction:.1f}%")
        self.stdout.write(f"  Time improvement: {time_improvement:.1f}%")
        
        if query_reduction > 50:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Excellent query optimization"))
        elif query_reduction > 30:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Good query optimization"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Limited query optimization"))

    def test_batched_writes(self, iterations):
        """Test batched write performance"""
        self.stdout.write(f'\n[Test 4] Batched Writes ({iterations} updates)...')
        
        user1 = User.objects.create_user(username='bwtest1', email='bw1@test.com', password='test')
        user2 = User.objects.create_user(username='bwtest2', email='bw2@test.com', password='test')
        game = Game.objects.create(
            creator=user1,
            white=user1,
            black=user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300
        )
        
        # Without batching (individual saves)
        reset_queries()
        start = time.perf_counter()
        for i in range(iterations):
            game.moves = f"test {i}"
            game.save(update_fields=['moves'])
        time_no_batch = (time.perf_counter() - start) * 1000
        queries_no_batch = len(connection.queries)
        
        # With batching (GameProxy)
        reset_queries()
        start = time.perf_counter()
        for i in range(iterations):
            game.moves = f"test {i}"
            GameProxy.update_game(game, immediate_flush=False)
        GameProxy.flush_all_dirty()
        time_batched = (time.perf_counter() - start) * 1000
        queries_batched = len(connection.queries)
        
        query_reduction = ((queries_no_batch - queries_batched) / queries_no_batch) * 100
        time_improvement = ((time_no_batch - time_batched) / time_no_batch) * 100
        
        self.stdout.write(f"  Without batching: {time_no_batch:.2f}ms, {queries_no_batch} queries")
        self.stdout.write(f"  With batching: {time_batched:.2f}ms, {queries_batched} queries")
        self.stdout.write(f"  Query reduction: {query_reduction:.1f}%")
        self.stdout.write(f"  Time improvement: {time_improvement:.1f}%")
        
        if query_reduction > 80:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Excellent batching (>{query_reduction:.0f}% reduction)"))
        elif query_reduction > 50:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Good batching ({query_reduction:.0f}% reduction)"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Limited batching benefit"))

    def test_full_game_flow(self):
        """Test full game flow performance"""
        self.stdout.write('\n[Test 5] Full Game Flow Simulation...')
        
        user1 = User.objects.create_user(username='flow1', email='flow1@test.com', password='test')
        user2 = User.objects.create_user(username='flow2', email='flow2@test.com', password='test')
        game = Game.objects.create(
            creator=user1,
            white=user1,
            black=user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300,
            current_fen=chess.STARTING_FEN
        )
        
        moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 
                 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7']
        board = chess.Board()
        
        reset_queries()
        start = time.perf_counter()
        
        for i, move_str in enumerate(moves):
            # Process move with optimizations
            success, error, move, extra_data = process_move_optimized(game, move_str, board)
            
            if success:
                game.moves = (game.moves or "") + " " + extra_data['san']
                game.current_fen = extra_data['fen']
                
                # Use GameProxy (batched, except last move)
                immediate = (i == len(moves) - 1)
                GameProxy.update_game(game, immediate_flush=immediate)
        
        # Final flush
        GameProxy.flush_all_dirty()
        
        elapsed = (time.perf_counter() - start) * 1000
        queries = len(connection.queries)
        
        self.stdout.write(f"  Processed {len(moves)} moves")
        self.stdout.write(f"  Total time: {elapsed:.2f}ms")
        self.stdout.write(f"  Average per move: {(elapsed/len(moves)):.2f}ms")
        self.stdout.write(f"  Database queries: {queries}")
        self.stdout.write(f"  Queries per move: {queries/len(moves):.2f}")
        
        if elapsed < len(moves) * 50:  # < 50ms per move
            self.stdout.write(self.style.SUCCESS(f"  ✓ FAST game flow"))
        elif elapsed < len(moves) * 100:
            self.stdout.write(self.style.SUCCESS(f"  ✓ ACCEPTABLE game flow"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ SLOW game flow"))
        
        if queries / len(moves) < 2:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Efficient queries (<2 per move)"))
        else:
            self.stdout.write(self.style.WARNING(f"  ⚠ Too many queries ({queries/len(moves):.2f} per move)"))

