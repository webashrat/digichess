# DigiChess backend (Django + DRF)

Backend scaffold that supports email+OTP registration, token login, friends, chat threads, and lightweight game sessions for bullet/blitz/rapid/classical time controls.

## Setup
- Ensure PostgreSQL is running and your `.env` contains DB + email settings (see provided `.env`).
- Install deps: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Export env vars: `set -a && source .env && set +a`
- Run migrations: `python manage.py makemigrations && python manage.py migrate`
- Create an admin user: `python manage.py createsuperuser`
- Start server: 
  - **Recommended for WebSocket support**: `daphne -b 0.0.0.0 -p 8000 config.asgi:application`
  - Or use: `python manage.py runserver` (Channels modifies runserver to use ASGI, but daphne is more reliable)

## API overview
All endpoints live under `/api/…` and use token authentication once logged in.

**Auth / Accounts**
- `POST /api/accounts/register/` `{email, username, password, first_name?, last_name?}` → creates inactive user + sends OTP to email.
- `POST /api/accounts/verify-otp/` `{email, code}` → activates account, returns token.
- `GET/POST /api/accounts/resend-otp/` `{email}` (or `?email=`) → regenerate and resend OTP if not yet verified.
- `POST /api/accounts/login/` `{email, password}` → returns token.
- `GET/PATCH /api/accounts/me/` → profile.
- `POST /api/accounts/logout/` → deletes tokens.
- `GET /api/public/accounts/` → paginated public list with optional `search` and `sort` (username, ratings, date_joined).
- `GET /api/public/accounts/{username}/` → public profile (includes ratings).

**Friends & chat**
- `GET/POST /api/social/friend-requests/` → send by `to_email`, list incoming/outgoing pending requests.
- `POST /api/social/friend-requests/{id}/respond/` `{decision: accept|decline}`.
- `GET /api/social/friends/` → list current friends.
- `GET /api/social/friends/?user_id=` → public view of a user’s friends unless they hide it.
- `GET/POST /api/social/chat/threads/` (`participant_id` to create direct thread with any registered user; self-chats are blocked).
- `GET/POST /api/social/chat/threads/{thread_id}/messages/` → message a thread.

**Games**
- `GET/POST /api/games/` → create game vs `opponent_id` with `time_control` (bullet|blitz|rapid|classical|custom) and optional `preferred_color` (white|black).
  - Custom clocks: supply `white_time_seconds` / `black_time_seconds` and `white_increment_seconds` / `black_increment_seconds` (e.g., white 180s, black 60s, both 0 increment). If you pass any of these or set `time_control` to `custom`, the game stores asymmetric timing. If you omit them, defaults are picked from the chosen `time_control`.
- `GET /api/games/{id}/` → game detail.
- `POST /api/games/{id}/move/` `{move}` → append SAN/PGN move, auto-starts if pending.
- `POST /api/games/{id}/finish/` `{result: "1-0"|"0-1"|"1/2-1/2"|"*"}` → mark result.
- `GET /api/games/{id}/analysis/` → spectator-only during active games; returns board status, legal moves, and (if configured) Stockfish analysis. Players cannot view live analysis while the game is active.
- `GET /api/games/public/` → public paginated list of games, filter by time_control, start/end timestamps, and sort on created_at/time_control/status.

**Emails**
- OTP verification emails use a styled template with the code and expiry.
- Friend requests trigger an email to the recipient.
- Game challenges trigger an email to the challenged user with the time control details.

## Notes
- Custom user model uses unique email as the login identifier.
- OTP expiry defaults to 10 minutes and uses your SMTP credentials from `.env`.
- Email sending: if `SENDGRID_API_KEY` is set, the backend uses SendGrid's HTTP API (recommended when SMTP is blocked). Otherwise it falls back to the configured Django email backend.
- Chat and games are HTTP-based; swap to Django Channels/WebSockets for real-time blitz/bullet play.
- For rules validation, moves are checked with `python-chess`; optional Stockfish analysis is used for spectators if `STOCKFISH_PATH` is set.
- Real-time: WebSocket endpoints `/ws/game/{id}/` and `/ws/spectate/{id}/` stream game state; moves made via HTTP are broadcast to subscribers. (Uses Django Channels + Redis.)
- Presence + user events: `POST /api/accounts/ping/` updates presence; `ws/user/{user_id}/` can receive matchmaking events (enqueued, match_found).
- Draw/resign/claim endpoints: `/offer-draw`, `/respond-draw`, `/claim-draw`, `/resign`.
- Matchmaking (basic): enqueue/cancel/status under `/api/games/matchmaking/`; pairs oldest entrants in rated pools.
- Runtime: Redis-backed presence and matchmaking queues; Celery scaffold added (broker=result backend use `REDIS_URL`). Start ASGI server (Channels) and Celery worker for async tasks when you add them.
- Tournaments: types now include knockout, round robin, arena, and swiss. Arena requires `arena_duration_minutes`; swiss requires `swiss_rounds`. Registration locks at start; knockout trims late joiners to 2^n; arena sets end time on start.
- Tournament helpers: `POST /api/games/tournaments/{id}/pairings/` (creator) to generate simple pairings; `GET /api/games/tournaments/{id}/standings/` for scores (1 win, 0.5 draw). `TournamentGame` links games to tournaments.
- Live clock API: `GET /api/games/{id}/clock/` (reads Redis-stored clock).
- Matchmaking WS status: global `mm_status` events broadcast pool sizes; enqueue/match_found include pool info.
- Glicko decay: daily RD decay task approximates Glicko-2 drift.
- Clock ticker: Redis stores turn and clocks; Celery beat (1s) deducts time for side to move, flags on zero, and broadcasts clock updates. Glicko volatility now slowly decays.
- Swiss standings now include Buchholz and Median Buchholz tiebreaks; Swiss pairings skip unfinished rounds, add byes if odd, and avoid repeats; Arena pairings avoid recent repeats and pair by score (3/1/0).
