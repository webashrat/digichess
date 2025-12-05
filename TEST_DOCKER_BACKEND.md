# Test Frontend with Docker Backend

## ✅ Everything is Ready!

Your frontend is already configured to connect to `http://localhost:8000`, which is exactly where your Docker backend is running!

## Quick Test (3 Steps)

### Step 1: Make Sure Backend is Running

```bash
cd digichess-backend
docker compose ps
```

Should show all services running. If not:
```bash
docker compose up -d
```

### Step 2: Start Frontend

```bash
cd digichess-frontend
npm run dev
```

### Step 3: Open Browser

Open: **http://localhost:5173**

**Done!** Your frontend is now connected to your Docker backend. 🎉

## Configuration Summary

### Frontend (Already Set)
- API URL: `http://localhost:8000` ✅
- WebSocket URL: `ws://localhost:8000` ✅
- Frontend Port: `5173` ✅

### Backend (Already Set)
- API Port: `8000` ✅
- CORS: Allows `http://localhost:5173` ✅
- WebSocket: Enabled via Daphne ✅

## Test Checklist

Once frontend is running at http://localhost:5173:

- [ ] **Home Page Loads** - Shows public games/leaderboard
- [ ] **No Console Errors** - Open DevTools (F12) → Console
- [ ] **Login/Register Works** - Creates users in Docker backend
- [ ] **Games Load** - Lists games from Docker database
- [ ] **WebSocket Connects** - Check Network tab for WS connections

## Troubleshooting

### If frontend can't connect:

1. **Verify backend is accessible:**
   ```bash
   curl http://localhost:8000/api/games/public/
   ```
   Should return JSON (even if empty array).

2. **Check backend logs:**
   ```bash
   cd digichess-backend
   docker compose logs backend | tail -20
   ```

3. **Verify CORS:**
   ```bash
   cd digichess-backend
   docker compose exec backend env | grep CORS
   ```

## Architecture Flow

```
Browser (http://localhost:5173)
    ↓
Frontend (Vite Dev Server)
    ↓
API Calls → http://localhost:8000/api/*
WebSocket → ws://localhost:8000/ws/*
    ↓
Docker Backend (localhost:8000)
    ↓
Django + Daphne + Channels
    ↓
PostgreSQL + Redis
```

## Running Both Services

**Terminal 1 - Docker Backend:**
```bash
cd digichess-backend
docker compose up -d
```

**Terminal 2 - Frontend:**
```bash
cd digichess-frontend
npm run dev
```

**Browser:**
Open http://localhost:5173

## That's It!

Your frontend and Docker backend are ready to work together! 🚀

