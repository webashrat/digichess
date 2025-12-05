# DigiChess API Reference (localhost:8000)

Auth: Token auth unless stated. Null allowed = field may be omitted/empty; defaults shown where relevant.

## Accounts
- **POST /api/accounts/register/**  
  Body (JSON):  
  - email (required, unique)  
  - username (required, unique)  
  - password (required, min 8)  
  - first_name, last_name (optional)  
  - nickname, bio (optional)  
  - country (optional, default: `INTERNATIONAL`)  
  - profile_pic (optional URL; must end with jpg/jpeg/png)  
  - social_links (optional list of `{label?, url}`; defaults to `[]`)  
  Response: 201 `{message, user}` where user includes profile fields, ratings (all default 800, digiquiz 0).

- **POST /api/accounts/verify-otp/**  
  Body: `{email, code}` → 200 `{token, user}` (activates account).

- **POST /api/accounts/resend-otp/** (GET also)  
  Body or query: `{email}` → 200 `{detail}` (new OTP sent).

- **POST /api/accounts/login/**  
  Body: `{email, password}` → 200 `{token, user}`.

- **POST /api/accounts/logout/** → 200 `{message}`.

- **GET /api/accounts/me/** → 200 user.  
  **PATCH /api/accounts/me/** updates your profile (email/username must stay unique). Null allowed on optional fields; ratings read-only.

- **POST /api/accounts/ping/** → 200 `{detail:"pong"}` (updates presence).

## Public Accounts
- **GET /api/public/accounts/** `?page=&page_size=&search=&sort=` → 200 paginated lookups `{id, first_name, last_name, profile_pic, username, country}`.
- **GET /api/public/accounts/{username}/** → full user detail incl. ratings, digiquiz stats, stats block, is_playing, spectate_game_id, is_online.

## Friends & Chat
- **GET/POST /api/social/friend-requests/**  
  POST body: `{to_email}` → 201 friend request. GET returns `{incoming, outgoing}` pending.
- **POST /api/social/friend-requests/{id}/respond/** body: `{decision:"accept"|"decline"}`.
- **GET /api/social/friends/** `?user_id=` → list friends (empty if user hides friends).
- **GET/POST /api/social/chat/threads/**  
  POST body: `{participant_id}` → 201 thread.  
  **GET/POST /api/social/chat/threads/{thread_id}/messages/** body: `{content}`.

## Games (auth unless noted)
- **POST /api/games/** → create game  
  Body:  
  - opponent_id (optional; if omitted, auto-pairs online idle user)  
  - preferred_color (optional, default "white")  
  - time_control (required) one of bullet|blitz|rapid|classical|custom  
  - white_time_seconds / black_time_seconds (optional; required for custom)  
  - white_increment_seconds / black_increment_seconds (optional, default 0)  
  Rules: rated controls require symmetric time/inc and valid ranges; custom requires mismatch and both times. Increment must be 0–60. Blocks if either player already in active game.  
  Response: 201 game.

- **GET /api/games/** → your games.  
  **GET /api/games/public/** `?time_control=&start=&end=&status=&sort=` → paginated public games.
- **GET /api/games/{id}/** → detail (players only).
- **POST /api/games/{id}/move/** body: `{move}` (SAN/uci). Enforces legality, clocks; broadcasts WS.
- **POST /api/games/{id}/finish/** body: `{result:"1-0"|"0-1"|"1/2-1/2"|"*"}`; allowed only if total moves ≤ 10 (5 per side). Updates ratings for rated pools.
- **POST /api/games/{id}/offer-draw/**; **/respond-draw/** `{decision}`; **/claim-draw/**; **/resign/**.
- **POST /api/games/{id}/accept/**, **/reject/** (initial challenge).
- **POST /api/games/{id}/rematch/**; **/rematch/accept/**; **/rematch/reject/**.
- **GET /api/games/{id}/analysis/** → spectators/finished only; returns board status + optional Stockfish (if `STOCKFISH_PATH` set).
- **GET /api/games/{id}/spectate/** → active games only.
- **GET /api/games/{id}/clock/** → live clock from Redis `{white_time_left, black_time_left, last_move_at, turn?}` (turn may be empty if missing).
- **POST /api/games/{game_id}/predict/** → spectators only, first 10 ply (5 moves each). Body: `{predicted_result:"white"|"black"|"draw"}`. One prediction per user/game. Correct +5 digiquiz, wrong -15.
- **WS**: `/ws/game/{id}/` (moves, clocks, draw/resign/claim); `/ws/spectate/{id}/` (read-only).

## Matchmaking (auth)
- **POST /api/games/matchmaking/enqueue/** body: `{time_control rated}`. Rating buckets with expanding window; may instantly create game → 201 game. WS events: `enqueued`, `match_found`, `mm_status`.
- **POST /api/games/matchmaking/cancel/** body (optional) `{time_control}`; WS `mm_status`.
- **GET /api/games/matchmaking/status/** → `{queues: positions, pool_sizes}`.
- **WS**: `/ws/user/{user_id}/` (personal) joins `mm_global` for events.

## Tournaments
- **POST /api/games/tournaments/**  
  Body: `{name, type: knockout|round_robin|arena|swiss, time_control, initial_time_seconds?, increment_seconds?, start_at, arena_duration_minutes?, swiss_rounds?, description?}`  
  Defaults: initial_time_seconds per format; increment defaults 0. Arena requires duration>0, Swiss requires rounds>0.
- **GET /api/games/tournaments/** `?status=&type=&page=&page_size=`; **GET /api/games/tournaments/{id}/**.
- **POST /api/games/tournaments/{id}/register/** (pending + before start_at).
- **POST /api/games/tournaments/{id}/start/**: locks registration; knockout trims to 2^n; arena sets end; swiss sets current_round.
- **POST /api/games/tournaments/{id}/pairings/**: creator only; swiss triggers async pairings; others create simple pairings; returns `{pairings:[game_ids]}`.
- **GET /api/games/tournaments/{id}/standings/**: arena scoring 3/1/0; swiss includes Buchholz/Median; others 1/0.5.
- **POST /api/games/tournaments/{id}/finish/** body `{winners:[u1,u2,u3,...]}` sets completed.

## Leaderboards (public)
- **GET /api/games/leaderboard/ratings/?mode=blitz|bullet|rapid|classical&limit=&page=**  
  Sorted by rating desc, RD asc, username. Returns lookup fields + rating.
- **GET /api/games/leaderboard/digiquiz/?limit=&page=**  
  Sorted by rating_digiquiz desc, digiquiz_correct desc, username. Returns lookup fields + digiquiz stats.

## Live/Infrastructure
- Presence: `POST /api/accounts/ping/` (Redis TTL + DB flags).
- Clocks: move stores clocks+turn in Redis; Celery beat (1s) deducts side-to-move, flags on zero, broadcasts WS clock.
- Ratings: per-pool Glicko-like; async rating update task; daily RD/vol decay.
- Matchmaking WS status: `mm_status` events broadcast pool sizes to `mm_global`.
- Stockfish: set `STOCKFISH_PATH` for spectator analysis.

Defaults & null behavior:
- Optional fields may be omitted; profile optional fields default to empty/INTERNATIONAL; social_links defaults to `[]`; ratings default 800; digiquiz default 0/0/0; increments default 0 when omitted; custom games require both times.

Example responses are documented inline; all endpoints return 4xx on validation errors (JSON `{detail: ...}`) unless otherwise noted.
