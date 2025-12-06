#!/usr/bin/env python
"""
Quick benchmark script - can be run standalone
Usage: python benchmark.py
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import time
import chess
from django.db import connection, reset_queries
from django.core.cache import cache
from games.game_proxy import GameProxy
from games.move_optimizer import process_move_optimized, latency_monitor
from games.models import Game
from django.contrib.auth import get_user_model

User = get_user_model()

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def test_move_processing():
    """Test move processing speed"""
    print_section("Move Processing Performance")
    
    board = chess.Board()
    moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']
    
    iterations = 100
    total_time = 0
    total_moves = 0
    
    for i in range(iterations):
        board = chess.Board()
        for move_str in moves:
            start = time.perf_counter()
            success, error, move, data = process_move_optimized(None, move_str, board)
            elapsed = (time.perf_counter() - start) * 1000
            total_time += elapsed
            total_moves += 1
    
    avg_time = total_time / total_moves
    
    print(f"  Iterations: {iterations}")
    print(f"  Total moves processed: {total_moves}")
    print(f"  Total time: {total_time:.2f}ms")
    print(f"  Average per move: {avg_time:.2f}ms")
    print(f"  Target: <50ms per move")
    
    if avg_time < 30:
        print(f"  ✅ EXCELLENT: {avg_time:.2f}ms")
    elif avg_time < 50:
        print(f"  ✅ FAST: {avg_time:.2f}ms")
    elif avg_time < 100:
        print(f"  ⚠️  ACCEPTABLE: {avg_time:.2f}ms")
    else:
        print(f"  ❌ SLOW: {avg_time:.2f}ms")
    
    print(f"  Latency monitor average: {latency_monitor.average():.2f}ms")

def test_query_optimization():
    """Test query optimization"""
    print_section("Query Optimization (N+1 Elimination)")
    
    # Create test data
    user1 = User.objects.create_user(username='bench1', email='b1@test.com', password='test')
    user2 = User.objects.create_user(username='bench2', email='b2@test.com', password='test')
    
    games = []
    for i in range(10):
        game = Game.objects.create(
            creator=user1,
            white=user1 if i % 2 == 0 else user2,
            black=user2 if i % 2 == 0 else user1,
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
    
    query_reduction = ((queries_unopt - queries_opt) / queries_unopt) * 100 if queries_unopt > 0 else 0
    time_improvement = ((time_unopt - time_opt) / time_unopt) * 100 if time_unopt > 0 else 0
    
    print(f"  Without optimization:")
    print(f"    Time: {time_unopt:.2f}ms")
    print(f"    Queries: {queries_unopt}")
    print(f"  With optimization:")
    print(f"    Time: {time_opt:.2f}ms")
    print(f"    Queries: {queries_opt}")
    print(f"  Query reduction: {query_reduction:.1f}%")
    print(f"  Time improvement: {time_improvement:.1f}%")
    
    if query_reduction > 80:
        print(f"  ✅ Excellent: {query_reduction:.0f}% reduction")
    elif query_reduction > 50:
        print(f"  ✅ Good: {query_reduction:.0f}% reduction")
    else:
        print(f"  ⚠️  Limited: {query_reduction:.0f}% reduction")

def test_batched_writes():
    """Test batched write performance"""
    print_section("Batched Writes Performance")
    
    user1 = User.objects.create_user(username='batch1', email='batch1@test.com', password='test')
    user2 = User.objects.create_user(username='batch2', email='batch2@test.com', password='test')
    game = Game.objects.create(
        creator=user1,
        white=user1,
        black=user2,
        time_control=Game.TIME_BLITZ,
        white_time_left=300,
        black_time_left=300
    )
    
    iterations = 100
    cache.clear()
    
    # Without batching
    reset_queries()
    start = time.perf_counter()
    for i in range(iterations):
        game.moves = f"test {i}"
        game.save(update_fields=['moves'])
    time_no_batch = (time.perf_counter() - start) * 1000
    queries_no_batch = len(connection.queries)
    
    # With batching
    reset_queries()
    start = time.perf_counter()
    for i in range(iterations):
        game.moves = f"test {i}"
        GameProxy.update_game(game, immediate_flush=False)
    GameProxy.flush_all_dirty()
    time_batched = (time.perf_counter() - start) * 1000
    queries_batched = len(connection.queries)
    
    query_reduction = ((queries_no_batch - queries_batched) / queries_no_batch) * 100 if queries_no_batch > 0 else 0
    time_improvement = ((time_no_batch - time_batched) / time_no_batch) * 100 if time_no_batch > 0 else 0
    
    print(f"  Updates: {iterations}")
    print(f"  Without batching:")
    print(f"    Time: {time_no_batch:.2f}ms")
    print(f"    Queries: {queries_no_batch}")
    print(f"  With batching:")
    print(f"    Time: {time_batched:.2f}ms")
    print(f"    Queries: {queries_batched}")
    print(f"  Query reduction: {query_reduction:.1f}%")
    print(f"  Time improvement: {time_improvement:.1f}%")
    
    if query_reduction > 90:
        print(f"  ✅ Excellent: {query_reduction:.0f}% reduction")
    elif query_reduction > 70:
        print(f"  ✅ Good: {query_reduction:.0f}% reduction")
    else:
        print(f"  ⚠️  Limited: {query_reduction:.0f}% reduction")

def main():
    print("\n" + "="*60)
    print("  DigiChess Backend Performance Benchmark")
    print("="*60)
    
    cache.clear()
    
    test_move_processing()
    test_query_optimization()
    test_batched_writes()
    
    print("\n" + "="*60)
    print("  Benchmark Complete")
    print("="*60 + "\n")

if __name__ == '__main__':
    main()

