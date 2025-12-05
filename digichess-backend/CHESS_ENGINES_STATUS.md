# Chess Engines Status in Docker

## ✅ Both Engines Fully Operational!

### Overall Status: 🟢 ALL SYSTEMS GO

---

## 📊 Stockfish Engine

### ✅ Status: FULLY OPERATIONAL

- **Location**: `/usr/local/bin/stockfish`
- **Version**: Stockfish dev-20251201-5297ba0a
- **NNUE**: ✅ Enabled (neural network evaluation)
- **Threads**: 1 (configurable)

### Test Results

**All tests passed:**

✅ **Engine Loading**: Working  
✅ **Move Generation**: Working  
✅ **Position Analysis**: Working  
✅ **Rating-Limited Play**: Working
   - Rating 2000: ✅ Working
   - Rating 2200: ✅ Working
   - Rating 2400: ✅ Working
✅ **Skill Level Configuration**: Working  
✅ **Complex Positions**: Working  
✅ **Benchmark**: Completed successfully  

### Use Cases

- **Bot Play**: Ratings 1900-2500 (strong play)
- **Game Analysis**: Spectator and post-game analysis
- **Fallback**: Automatic fallback if Maia fails

---

## 🤖 Maia Chess Engine

### ✅ Status: FULLY OPERATIONAL

- **Location**: `/usr/local/bin/lc0`
- **Version**: v0.32.1
- **Models**: All 9 models present (12MB total)

### Test Results

**All tests passed:**

✅ **lc0 Engine**: Installed and working  
✅ **Maia Models**: All 9 models available  
✅ **Move Generation**: Working
   - Rating 1100: ✅ Generated move using maia-1200
   - Rating 1500: ✅ Generated move using maia-1500
   - Rating 1900: ✅ Generated move using maia-1900
✅ **Model Loading**: Working  
✅ **Neural Network**: OpenBLAS working (12 cores detected)  

### Use Cases

- **Bot Play**: Ratings 800-1900 (human-like play)
- **Natural Moves**: Mimics human decision-making
- **Rating-Adaptive**: Uses appropriate model for bot rating

---

## 🎯 Bot Rating System

### Rating → Engine Mapping

```
┌─────────────────────────────────────────┐
│  Rating 800-1900                        │
│  ↓                                      │
│  Maia Chess (human-like)                │
│  ✅ Uses lc0 + Maia neural networks     │
│  ✅ Falls back to Stockfish if needed   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Rating 1900-2500                       │
│  ↓                                      │
│  Stockfish (strong play)                │
│  ✅ Uses Elo-based strength limiting    │
│  ✅ Configurable depth/time limits      │
└─────────────────────────────────────────┘
```

### Maia Model Selection

```
800-1049   → maia-1100.pb.gz
1050-1249  → maia-1200.pb.gz
1250-1349  → maia-1300.pb.gz
1350-1449  → maia-1400.pb.gz
1450-1549  → maia-1500.pb.gz
1550-1649  → maia-1600.pb.gz
1650-1749  → maia-1700.pb.gz
1750-1849  → maia-1800.pb.gz
1850-1900  → maia-1900.pb.gz
```

---

## 🔧 Environment Configuration

### Automatic Configuration

All paths are set automatically in Docker:

```env
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models
```

### Verification

```bash
# Check environment variables
docker compose exec backend env | grep -E "STOCKFISH|LC0|MAIA"

# Should show:
# STOCKFISH_PATH=/usr/local/bin/stockfish
# LC0_PATH=/usr/local/bin/lc0
# MAIA_MODELS_DIR=/app/games/maia_models
```

---

## 🧪 Quick Tests

### Test Stockfish

```bash
docker compose exec backend python -c "
import chess
import chess.engine
with chess.engine.SimpleEngine.popen_uci('/usr/local/bin/stockfish') as engine:
    board = chess.Board()
    result = engine.play(board, chess.engine.Limit(depth=5))
    print(f'Stockfish move: {board.san(result.move)}')
"
```

### Test Maia

```bash
docker compose exec backend python manage.py test_maia
```

### Test Both Together

```bash
# Test bot move generation (uses appropriate engine)
docker compose exec backend python -c "
from games.bot_utils import get_bot_move
import chess

board = chess.Board()

# Test Maia range
move1 = get_bot_move(board, 1500)
print(f'Rating 1500 (Maia): {board.san(move1)}')

# Test Stockfish range
move2 = get_bot_move(board, 2200)
print(f'Rating 2200 (Stockfish): {board.san(move2)}')
"
```

---

## 📈 Performance

### Stockfish
- **Move Generation**: ~0.1-0.5 seconds
- **Analysis**: ~0.1-1.0 seconds
- **Memory**: ~150-200MB
- **CPU**: Single-threaded (configurable)

### Maia (lc0)
- **Move Generation**: ~1-2 seconds
- **Model Loading**: First use only (cached after)
- **Memory**: ~100-200MB per instance
- **CPU**: Uses OpenBLAS (multi-threaded)

---

## ✅ Summary

### Stockfish
- ✅ Installed and working
- ✅ All features tested
- ✅ Rating limits working
- ✅ Analysis working
- ✅ Ready for production

### Maia Chess
- ✅ Installed and working
- ✅ All models available
- ✅ Move generation working
- ✅ Neural network operational
- ✅ Ready for production

### Combined System
- ✅ Automatic engine selection based on rating
- ✅ Fallback system working
- ✅ All bot ratings supported (800-2500)
- ✅ Production ready

**Overall Status**: 🟢 **FULLY OPERATIONAL**

Both engines are ready for production use! Your chess bots will automatically use the appropriate engine based on their rating.

