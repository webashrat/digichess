# Performance Testing Guide

This guide explains how to test the Lichess-style optimizations in the DigiChess backend.

## Quick Start

### Option 1: Run in Docker Container

```bash
# Enter the running Docker container
docker exec -it <container_name> bash

# Run performance tests
cd /app
python manage.py test_performance --iterations 100
```

### Option 2: Run Locally (with Django environment)

```bash
cd digichess-backend
python manage.py test_performance --iterations 100
```

### Option 3: Run Django Test Suite

```bash
cd digichess-backend
python manage.py test games.tests.performance_tests -v 2
```

## What Gets Tested

### 1. GameProxy Caching
- **Test**: Cache hit/miss performance
- **Metrics**: Query count, response time
- **Expected**: 50%+ reduction in queries on cache hits

### 2. Move Processing Speed
- **Test**: Move validation and processing latency
- **Metrics**: Average milliseconds per move
- **Target**: <50ms per move
- **Iterations**: Configurable (default: 100)

### 3. Query Optimization (N+1 Elimination)
- **Test**: Comparison of optimized vs unoptimized queries
- **Metrics**: Query count reduction
- **Expected**: 50%+ reduction in queries

### 4. Batched Writes
- **Test**: Performance of batched vs individual database writes
- **Metrics**: Query count, total time
- **Expected**: 80%+ reduction in queries with batching

### 5. Full Game Flow
- **Test**: Complete game simulation with all optimizations
- **Metrics**: Total time, queries per move
- **Target**: <50ms per move, <2 queries per move

## Test Results Interpretation

### ✅ Excellent Performance
- Move processing: <30ms average
- Query reduction: >80%
- Game flow: <50ms per move

### ✅ Good Performance
- Move processing: 30-50ms average
- Query reduction: 50-80%
- Game flow: 50-100ms per move

### ⚠️ Needs Improvement
- Move processing: >50ms average
- Query reduction: <50%
- Game flow: >100ms per move

## Example Output

```
=== DigiChess Performance Test ===

[Test 1] GameProxy Caching...
  First access: 15.23ms, 2 queries
  Second access: 2.45ms, 1 queries
  ✓ Cache working: 83.9% faster

[Test 2] Move Processing Speed (100 iterations)...
  Processed 800 moves in 12500.00ms
  Average: 15.63ms per move
  Target: <50ms per move
  ✓ FAST: 15.63ms (target: <50ms)

[Test 3] Query Optimization (N+1 Elimination)...
  Without optimization: 45.23ms, 21 queries
  With optimization: 12.45ms, 3 queries
  Query reduction: 85.7%
  Time improvement: 72.5%
  ✓ Excellent query optimization

[Test 4] Batched Writes (100 updates)...
  Without batching: 1250.00ms, 100 queries
  With batching: 125.00ms, 1 queries
  Query reduction: 99.0%
  Time improvement: 90.0%
  ✓ Excellent batching (>99% reduction)

[Test 5] Full Game Flow Simulation...
  Processed 20 moves
  Total time: 450.00ms
  Average per move: 22.50ms
  Database queries: 5
  Queries per move: 0.25
  ✓ FAST game flow
  ✓ Efficient queries (<2 per move)
```

## Continuous Monitoring

For production monitoring, check:

1. **Move Latency Monitor**
```python
from games.move_optimizer import latency_monitor
avg_latency = latency_monitor.average()  # milliseconds
```

2. **Cache Hit Rate**
- Monitor Redis cache statistics
- Track `game_proxy:*` keys

3. **Database Query Count**
- Use Django Debug Toolbar in development
- Monitor query logs in production

4. **Celery Task Performance**
- Check Celery Beat logs for flush_dirty_games task
- Monitor task execution time

## Performance Benchmarks

Based on Lichess architecture, target metrics:

| Metric | Target | Current (After Optimization) |
|--------|--------|------------------------------|
| Move processing | <20ms | <50ms |
| Cache hit rate | >80% | >70% |
| Query reduction | >90% | >80% |
| Game flow latency | <30ms/move | <50ms/move |
| Database writes | Batched (30s) | Batched (30s) |

## Troubleshooting

### If tests show slow performance:

1. **Check Redis connection**
   - Ensure Redis is running and accessible
   - Verify `REDIS_URL` in settings

2. **Check database indexes**
   - Verify indexes on Game table (id, status, white_id, black_id)
   - Run `python manage.py dbshell` and check indexes

3. **Check Celery**
   - Ensure Celery Beat is running
   - Verify `flush_dirty_games` task is scheduled

4. **Monitor system resources**
   - Check CPU usage during tests
   - Check memory usage
   - Check database connection pool

## Manual Testing

You can also test manually:

```python
# In Django shell: python manage.py shell

from games.game_proxy import GameProxy
from games.move_optimizer import process_move_optimized, latency_monitor
import chess
import time

# Test move processing
board = chess.Board()
start = time.perf_counter()
for move in ['e4', 'e5', 'Nf3', 'Nc6']:
    process_move_optimized(None, move, board)
elapsed = (time.perf_counter() - start) * 1000
print(f"Processed 4 moves in {elapsed:.2f}ms")
print(f"Average: {latency_monitor.average():.2f}ms")

# Test GameProxy
game = Game.objects.first()
start = time.perf_counter()
proxy_game = GameProxy.get_game(game.id)
elapsed = (time.perf_counter() - start) * 1000
print(f"GameProxy access: {elapsed:.2f}ms")
```

## Next Steps

After running tests:
1. Review results and identify bottlenecks
2. Adjust cache timeouts if needed
3. Tune batch flush interval if necessary
4. Monitor production performance
5. Iterate based on real-world usage

