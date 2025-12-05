# Quick Start: Connect Frontend to Docker Backend

## ✅ Your Setup is Already Configured!

Your frontend defaults to `http://localhost:8000` which matches your Docker backend.

## 3 Simple Steps

### Step 1: Verify Docker Backend is Running

```bash
cd digichess-backend
docker compose ps
```

All services should be running. If not:
```bash
docker compose up -d
```

### Step 2: Start Frontend

```bash
cd digichess-frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

### Step 3: Open Browser

Open: **http://localhost:5173**

That's it! Your frontend is now connected to your Docker backend.

## What's Already Configured

✅ **API URL**: `http://localhost:8000` (default in `src/api/client.ts`)
✅ **WebSocket URL**: `ws://localhost:8000` (default in `src/utils/ws.ts`)
✅ **CORS**: Backend allows `http://localhost:5173`
✅ **Vite Proxy**: Configured to forward `/api` and `/ws` requests

## Quick Test

Once frontend is running:

1. **Open http://localhost:5173**
2. **Check Browser Console** (F12) - should see no errors
3. **Home page** should load (public games, leaderboard)
4. **Try Login/Register** - connects to Docker backend

## Troubleshooting

### CORS Error?

Your backend CORS should already be configured. Check:
```bash
cd digichess-backend
docker compose exec backend env | grep CORS
```

### Can't Connect?

1. **Check backend is running:**
   ```bash
   curl http://localhost:8000/api/games/public/
   ```

2. **Check backend logs:**
   ```bash
   docker compose logs backend
   ```

3. **Restart backend:**
   ```bash
   docker compose restart backend
   ```

## Running Both Services

**Terminal 1 - Backend (keep running):**
```bash
cd digichess-backend
docker compose up -d
docker compose logs -f backend
```

**Terminal 2 - Frontend:**
```bash
cd digichess-frontend
npm run dev
```

Then open **http://localhost:5173** in your browser!

## Next Steps

1. ✅ Frontend connects automatically
2. 🎮 Test login/register
3. 🎮 Test creating games
4. 🎮 Test playing chess!

Enjoy! 🚀

