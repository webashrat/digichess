# Lichess API Token Setup

## Overview
**The token is OPTIONAL but RECOMMENDED** - your app works without it, but adding it makes everything faster!

Your DigiChess application now uses authenticated Lichess API requests (when token is set) for:
- **Higher rate limits** - Authenticated requests get 50+ requests per minute (vs 10 unauthenticated)
- **Faster responses** - Priority queue for authenticated requests
- **More reliable** - Less likely to hit rate limits during peak usage
- **Future features** - Access to board API, challenges, tournaments, etc.

## Token Details
Your personal access token has been configured with permissions for:
- Read email address, Read preferences, Write preference
- Read followed players, Follow and unfollow other players
- Send private messages to other players
- Read incoming challenges, Send, accept and reject challenges
- Create many games at once for other players
- Create, update, and join tournaments
- Read private team information, Join and leave teams
- Manage teams you lead: send PMs, kick members
- Read puzzle activity, Solve puzzles
- Create and join puzzle races
- Read private studies and broadcasts
- Create, update, delete studies and broadcasts
- Play games with board API
- View and use your external engines
- Create and update external engines

## Environment Variable Setup (OPTIONAL but RECOMMENDED)

**Note**: Without the token, your app still works but with slower unauthenticated API calls. Adding the token gives you:
- 5x faster rate limits (50+ req/min vs 10 req/min)
- Priority queue access
- More reliable under load

### Local Development (.env file)
Add to your `digichess-backend/.env` file (create it if it doesn't exist):
```bash
LICHESS_API_TOKEN=your_lichess_token_here
```
**Note**: Replace `your_lichess_token_here` with your actual Lichess personal access token.

### Render (Production)
1. Go to your Render dashboard: https://dashboard.render.com
2. Navigate to your DigiChess backend service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `LICHESS_API_TOKEN`
   - **Value**: Your actual Lichess personal access token (starts with `lip_`)
6. Click **Save Changes**
7. Render will automatically redeploy with the new environment variable

### Verification
Once set up, all Lichess API calls will automatically use authentication:
- Cloud evaluation (analysis)
- Opening explorer (bot moves)
- Tablebase (endgame)
- Puzzle API
- Any future Lichess integrations

## Benefits

### Before (Unauthenticated)
- 10 requests/minute rate limit
- Slower response times during peak hours
- More likely to hit rate limits
- No access to advanced features

### After (Authenticated)
- 50+ requests/minute rate limit
- Faster response times (priority queue)
- More reliable under load
- Access to board API for future bot improvements

## Security Notes
- The token is stored as an environment variable, never in code
- Token is only used server-side, never exposed to clients
- If the token is compromised, revoke it immediately on Lichess and generate a new one
- Never commit the token to git (it's in `.env` which should be gitignored)

## Future Enhancements
With authenticated API access, you can now implement:
1. **Board API Integration** - Play bot games directly via Lichess board API (much faster)
2. **Challenges** - Allow users to challenge Lichess players
3. **Tournaments** - Create and manage tournaments
4. **Puzzle Races** - Multiplayer puzzle competitions
5. **Studies** - Share and analyze games with studies

## Token Management
- To revoke/regenerate token: https://lichess.org/account/oauth/token
- Token expiration: 1 year (configurable)
- Current token expiration: December 2026

