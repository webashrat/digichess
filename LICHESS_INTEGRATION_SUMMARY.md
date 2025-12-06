# Lichess API Integration for Smooth Game Flow

## Overview
This integration uses Lichess APIs to make the game flow faster, smoother, and more responsive. It addresses issues like:
- Pieces disappearing on refresh
- Move lag
- Slow reconnection
- Board state synchronization problems

## Features Implemented

### 1. Fast Move Validation (`lichess_game_flow.py`)
- **Local validation first** (instant) using `chess.py`
- **Lichess explorer backup** for edge cases
- Returns validation result immediately

### 2. Optimistic Move Endpoint (`/api/games/<id>/move/optimistic/`)
- **Instant UI feedback** - validates move without saving
- Returns:
  - Move validity
  - New FEN position
  - Legal moves after move
  - Optional evaluation feedback
- Client can show move instantly, then confirm with regular endpoint

### 3. Enhanced WebSocket Payloads
- **Full game state** included in every move broadcast (like Lichess `gameState`)
- **Legal moves** included for instant board interactivity
- **Game state export** for smooth reconnection

### 4. Improved WebSocket Consumer
- **Full game state on connect** (like Lichess `gameFull`)
- Includes:
  - Complete game data
  - Legal moves
  - Board state
  - Clock information
- Prevents pieces disappearing on reconnect

### 5. Lichess Cloud Evaluation for Instant Feedback
- **Non-blocking evaluation** for move feedback
- Shows evaluation hints while move processes
- Uses Lichess cloud eval (depth 12, fast)

### 6. Bot Move Optimization
- **Opening Explorer** for early game (first 20 moves)
- **Tablebase** for endgame (≤7 pieces, perfect play)
- **Maia** for mid-game (human-like)
- Results in faster, more realistic bot moves

## API Endpoints

### Move Endpoints
- `POST /api/games/<id>/move/` - Regular move (saves to DB)
- `POST /api/games/<id>/move/optimistic/` - Fast validation only

### Analysis Endpoints
- `POST /api/games/<id>/analysis/full/` - Full game analysis (uses Lichess cloud eval)
- `GET /api/games/<id>/analysis/` - Position analysis (uses Lichess cloud eval)

### Utility Endpoints
- `POST /api/games/opening-explorer/` - Opening explorer data
- `POST /api/games/tablebase/` - Tablebase for endgames
- `GET /api/games/puzzles/daily/` - Daily puzzle
- `GET /api/games/puzzles/<id>/` - Get puzzle by ID
- `GET /api/games/puzzles/next/` - Get new puzzle
- `GET /api/games/puzzles/batch/<angle>/` - Get multiple puzzles

## WebSocket Message Types

### On Connect: `gameFull`
```json
{
  "type": "gameFull",
  "game": { /* full game data */ },
  "sync": true
}
```

### On Move: `gameState`
```json
{
  "type": "gameState",
  "game_id": 123,
  "san": "e4",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "moves": "e4",
  "white_time_left": 300,
  "black_time_left": 300,
  "legal_moves": ["e5", "e6", "c5", ...],
  "game_state": { /* full board state */ },
  "last_move_at": 1234567890,
  "status": "active",
  "result": "*"
}
```

## Usage Recommendations

### Frontend Implementation

1. **Optimistic Moves**:
   ```javascript
   // Show move instantly
   const response = await fetch(`/api/games/${id}/move/optimistic/`, {
     method: 'POST',
     body: JSON.stringify({ move: 'e4' })
   });
   const data = await response.json();
   if (data.valid) {
     // Update UI immediately
     updateBoard(data.fen_after);
     // Then confirm with regular endpoint
     await fetch(`/api/games/${id}/move/`, {
       method: 'POST',
       body: JSON.stringify({ move: data.san })
     });
   }
   ```

2. **WebSocket Handling**:
   ```javascript
   ws.onmessage = (event) => {
     const data = JSON.parse(event.data);
     if (data.type === 'gameFull') {
       // Initial sync - update everything
       syncFullGame(data.game);
     } else if (data.type === 'gameState') {
       // Move update - update board state
       updateBoardState(data);
     }
   };
   ```

3. **Reconnection**:
   - On reconnect, WebSocket sends `gameFull` automatically
   - No need to manually fetch game state
   - Pieces won't disappear

## Performance Improvements

- **Move validation**: Instant (local) vs ~50-100ms (before)
- **Bot moves**: Faster with opening explorer + tablebase
- **UI updates**: Optimistic updates show moves instantly
- **Reconnection**: Full state sync prevents disappearing pieces
- **Analysis**: Lichess cloud eval (fast, cached) vs local Stockfish

## Fallback Strategy

1. **Lichess API fails** → Falls back to local validation/Stockfish
2. **Optimistic endpoint fails** → Regular endpoint still works
3. **WebSocket disconnected** → Regular API polling still works
4. **Cloud eval unavailable** → Local Stockfish used

All features gracefully degrade if Lichess API is unavailable.

