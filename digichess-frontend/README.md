# DigiChess Frontend

Next.js frontend for DigiChess — play chess online with ratings, friends, and tournaments.

## Stack

- **Next.js 14** (App Router)
- **React 19**
- **Tailwind CSS 4**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Optional: create `.env.local` for API and WebSocket:

   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
   NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000
   ```

   If unset, the app uses `/api` (proxied to `http://localhost:8000/api` via `next.config.js`) and infers WebSocket from the current host or `localhost:8000`.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Ensure the backend is running on port 8000 (or adjust the proxy in `next.config.js`).

## Scripts

- `npm run dev` — start development server
- `npm run build` — build for production
- `npm run start` — start production server
- `npm run lint` — run ESLint

## Structure

- `app/` — Next.js App Router pages and layout
- `components/` — shared UI (Navbar, Sidebar, Leaderboard, Profile, etc.)
- `lib/` — API client and auth context
- `hooks/` — useNotifications, useGameSync
- `src/` — legacy components and utils (chess, board presets, countries) used by the app

## Features

- **Home**: Rating stats, Play Chess grid (quick play + custom game modal), live games
- **Play**: Quick play, play vs bot, challenge from URL
- **Social**: Leaderboard (modes + DigiQuiz), friends list (playing / online / offline), add friend, message
- **Messages**: Chat threads and conversations
- **Profile**: View/edit profile, rating chart, recent games (no Play section; play/bot on dashboard)
- **Tournaments**: List and tournament lobby
- **Game**: Full game UI with board, clocks, chat, rematch

Navbar: notifications, settings (with logout), profile. Sidebar: Home, Play, Social, Tournaments (no Profile). `/rankings` redirects to `/leaderboard`.
