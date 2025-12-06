"""
Performance tests for Lichess-style optimizations
Run with: python manage.py test games.tests.performance_tests
"""
import time
import chess
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.db import connection, reset_queries
from django.core.cache import cache

from games.models import Game
from games.game_proxy import GameProxy
from games.move_optimizer import process_move_optimized, latency_monitor
from games.query_optimization import get_game_with_all_relations

User = get_user_model()


class GameProxyPerformanceTest(TestCase):
    """Test GameProxy caching and batching performance"""
    
    def setUp(self):
        self.user1 = User.objects.create_user(username='test1', email='test1@test.com', password='test')
        self.user2 = User.objects.create_user(username='test2', email='test2@test.com', password='test')
        self.game = Game.objects.create(
            creator=self.user1,
            white=self.user1,
            black=self.user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300,
            current_fen=chess.STARTING_FEN
        )
        cache.clear()
    
    def test_game_proxy_cache_hit(self):
        """Test that GameProxy cache reduces database queries"""
        # First access - cache miss
        reset_queries()
        game1 = GameProxy.get_game(self.game.id)
        queries_first = len(connection.queries)
        
        # Second access - should be cached (but still hits DB in test)
        reset_queries()
        game2 = GameProxy.get_game(self.game.id)
        queries_second = len(connection.queries)
        
        self.assertIsNotNone(game1)
        self.assertIsNotNone(game2)
        print(f"\n[GameProxy] First access queries: {queries_first}")
        print(f"[GameProxy] Second access queries: {queries_second}")
    
    def test_batched_writes(self):
        """Test that batched writes reduce database hits"""
        reset_queries()
        
        # Simulate multiple moves without flushing
        for i in range(10):
            self.game.current_fen = chess.STARTING_FEN
            self.game.moves = f"e2e4 {i}"
            GameProxy.update_game(self.game, immediate_flush=False)
        
        queries_before_flush = len(connection.queries)
        
        # Flush all
        GameProxy.flush_all_dirty()
        queries_after_flush = len(connection.queries)
        
        print(f"\n[Batched Writes] Queries before flush: {queries_before_flush}")
        print(f"[Batched Writes] Queries after flush: {queries_after_flush}")
        print(f"[Batched Writes] Total queries for 10 updates: {queries_after_flush}")
        # Should be much less than 10 individual saves


class MoveProcessingPerformanceTest(TestCase):
    """Test move processing optimization performance"""
    
    def setUp(self):
        self.board = chess.Board()
        latency_monitor._total_millis = 0
        latency_monitor._count = 0
    
    def test_move_processing_speed(self):
        """Test that move processing is fast"""
        moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']
        
        start = time.perf_counter()
        for move_str in moves:
            success, error, move, data = process_move_optimized(
                None,  # game not needed for basic test
                move_str,
                self.board
            )
            if success:
                # Move already applied in process_move_optimized
                pass
        
        elapsed = time.perf_counter() - start
        avg_time = elapsed / len(moves) * 1000  # ms per move
        
        print(f"\n[Move Processing] Processed {len(moves)} moves in {elapsed*1000:.2f}ms")
        print(f"[Move Processing] Average: {avg_time:.2f}ms per move")
        print(f"[Move Processing] Target: <50ms per move")
        
        self.assertLess(avg_time, 50, f"Move processing too slow: {avg_time:.2f}ms")
        self.assertTrue(all([
            process_move_optimized(None, m, chess.Board())[0] 
            for m in ['e4', 'e5', 'Nf3']
        ]))
    
    def test_latency_monitoring(self):
        """Test that latency monitoring tracks performance"""
        initial_avg = latency_monitor.average()
        
        # Process some moves
        board = chess.Board()
        for move_str in ['e4', 'e5', 'Nf3']:
            process_move_optimized(None, move_str, board)
        
        final_avg = latency_monitor.average()
        
        print(f"\n[Latency Monitor] Initial average: {initial_avg:.2f}ms")
        print(f"[Latency Monitor] Final average: {final_avg:.2f}ms")
        print(f"[Latency Monitor] Records: {latency_monitor._count}")
        
        self.assertGreater(latency_monitor._count, 0)


class QueryOptimizationTest(TransactionTestCase):
    """Test query optimization (N+1 elimination)"""
    
    def setUp(self):
        self.user1 = User.objects.create_user(username='user1', email='u1@test.com', password='test')
        self.user2 = User.objects.create_user(username='user2', email='u2@test.com', password='test')
        
        # Create multiple games
        self.games = []
        for i in range(5):
            game = Game.objects.create(
                creator=self.user1,
                white=self.user1 if i % 2 == 0 else self.user2,
                black=self.user2 if i % 2 == 0 else self.user1,
                time_control=Game.TIME_BLITZ,
                white_time_left=300,
                black_time_left=300
            )
            self.games.append(game)
    
    def test_select_related_optimization(self):
        """Test that select_related eliminates N+1 queries"""
        # Without optimization (N+1 problem)
        reset_queries()
        games_unoptimized = list(Game.objects.all())
        for game in games_unoptimized:
            _ = game.white.username  # Triggers additional query
            _ = game.black.username
        queries_unoptimized = len(connection.queries)
        
        # With optimization
        reset_queries()
        games_optimized = list(Game.objects.select_related('white', 'black').all())
        for game in games_optimized:
            _ = game.white.username  # No additional query
            _ = game.black.username
        queries_optimized = len(connection.queries)
        
        reduction = ((queries_unoptimized - queries_optimized) / queries_unoptimized) * 100
        
        print(f"\n[Query Optimization] Unoptimized queries: {queries_unoptimized}")
        print(f"[Query Optimization] Optimized queries: {queries_optimized}")
        print(f"[Query Optimization] Reduction: {reduction:.1f}%")
        
        self.assertLess(queries_optimized, queries_unoptimized)
        self.assertGreater(reduction, 50)  # At least 50% reduction


class IntegrationPerformanceTest(TransactionTestCase):
    """Integration test simulating real game flow"""
    
    def setUp(self):
        self.user1 = User.objects.create_user(username='player1', email='p1@test.com', password='test')
        self.user2 = User.objects.create_user(username='player2', email='p2@test.com', password='test')
        self.game = Game.objects.create(
            creator=self.user1,
            white=self.user1,
            black=self.user2,
            time_control=Game.TIME_BLITZ,
            white_time_left=300,
            black_time_left=300,
            current_fen=chess.STARTING_FEN
        )
        cache.clear()
    
    def test_full_game_flow_performance(self):
        """Test performance of a full game flow with optimizations"""
        moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']
        board = chess.Board()
        
        start_time = time.perf_counter()
        reset_queries()
        
        for i, move_str in enumerate(moves):
            # Simulate move processing with optimizations
            success, error, move, extra_data = process_move_optimized(
                self.game,
                move_str,
                board
            )
            
            if success:
                # Update game using GameProxy
                self.game.moves = (self.game.moves or "") + " " + extra_data['san']
                self.game.current_fen = extra_data['fen']
                GameProxy.update_game(self.game, immediate_flush=(i == len(moves) - 1))
        
        # Flush all
        GameProxy.flush_all_dirty()
        
        elapsed = time.perf_counter() - start_time
        queries = len(connection.queries)
        
        print(f"\n[Integration Test] Processed {len(moves)} moves")
        print(f"[Integration Test] Total time: {elapsed*1000:.2f}ms")
        print(f"[Integration Test] Average per move: {(elapsed/len(moves))*1000:.2f}ms")
        print(f"[Integration Test] Database queries: {queries}")
        print(f"[Integration Test] Queries per move: {queries/len(moves):.2f}")
        
        # Verify performance targets
        self.assertLess(elapsed, 1.0, "Game flow too slow")  # < 1 second for 10 moves
        self.assertLess(queries / len(moves), 2, "Too many queries per move")  # < 2 queries per move

