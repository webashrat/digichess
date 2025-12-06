# Testing Checklist for Game Flow Improvements

## Changes Made

1. **Real-time Clock Updates via WebSocket**
   - Enhanced `broadcast_clock_updates` task to broadcast clock every 1 second
   - Clock updates sent via WebSocket for all active games
   - Frontend receives `clock` type WebSocket messages

2. **Enhanced Move Broadcasting**
   - Move WebSocket payloads now include `gameState` format (like Lichess)
   - Includes `legal_moves`, `status`, `result`, and complete game state
   - Both player and bot moves use consistent format

3. **Piece Set Selection Fix**
   - Fixed pieceSet prop updates not triggering re-renders
   - Added useEffect to reset imageError when pieceSet changes

4. **Bot Game Test Script**
   - Created `test_bot_game.py` management command
   - Tests game creation, move flow, clock updates, FEN validation

## Testing Instructions

### 1. Test Clock Updates
- [ ] Start a game with a bot or another player
- [ ] Verify both clocks count down in real-time
- [ ] Check that opponent's clock is visible and updating
- [ ] Verify clock updates continue even when you don't make moves
- [ ] Test that clock syncs properly after reconnection

### 2. Test Move Flow
- [ ] Make moves in a game and verify pieces update immediately
- [ ] Check that pieces don't disappear or flicker
- [ ] Verify legal moves are highlighted correctly
- [ ] Test bot moves appear immediately without refresh
- [ ] Verify game state updates correctly after each move

### 3. Test Piece Set Selection
- [ ] Change piece set in game view settings
- [ ] Verify pieces update immediately to new style
- [ ] Try different piece sets (cburnett, merida, etc.)
- [ ] Check that custom SVG pieces work
- [ ] Verify piece set persists during game

### 4. Test Bot Game Script
```bash
# Activate virtual environment first
cd digichess-backend
source ../venv/bin/activate  # or your venv path

# Run test script
python manage.py test_bot_game --iterations 1 --user-email your@email.com

# Expected output:
# - Game creation success
# - Move flow working
# - Clock updates visible
# - Game completion
```

### 5. Manual Integration Testing
- [ ] Play a full game from start to finish
- [ ] Verify all moves are smooth
- [ ] Check clock accuracy and real-time updates
- [ ] Test with different time controls
- [ ] Verify WebSocket reconnection works
- [ ] Test piece set changes mid-game

## Known Issues to Watch For

1. **Clock Sync**: Ensure clocks stay in sync between server and client
2. **Piece Flickering**: Pieces should not disappear or flicker
3. **Move Delay**: Moves should appear instantly without lag
4. **WebSocket Drops**: Reconnection should work smoothly

## Rollback Plan

If issues are found, revert these commits:
```bash
git log --oneline | head -5  # Find commit hashes
git revert <commit-hash>
```


