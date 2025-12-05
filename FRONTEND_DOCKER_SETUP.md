# Connect Frontend to Docker Backend

## Quick Start

Your frontend is already configured to connect to `http://localhost:8000` by default. Since your Docker backend is running on that port, it should work immediately!

## Step-by-Step Setup

### 1. Ensure Docker Backend is Running

```bash
cd digichess-backend
docker compose ps
```

You should see all services running:
- ✅ digichess-backend (port 8000)
- ✅ digichess-postgres
- ✅ digichess-redis
- ✅ digichess-celery
- ✅ digichess-celery-beat

### 2. Verify Backend is Accessible

```bash
# Test backend API
curl http://localhost:8000/api/games/public/

# Should return JSON response (even if empty)
```

### 3. Start Frontend Development Server

```bash
cd digichess-frontend

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

The frontend will start on **http://localhost:5173** and automatically connect to your Docker backend at **http://localhost:8000**.

## Configuration

### Default Configuration (Already Set)

Your frontend is configured to use:
- **API URL**: `http://localhost:8000` (default)
- **WebSocket URL**: `ws://localhost:8000` (default)
- **Frontend Port**: `5173`

### Optional: Create .env File

If you want to explicitly set the backend URL, create a `.env` file in the frontend directory:

```bash
cd digichess-frontend
cat > .env << 'EOF'
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
EOF
```

### Environment Variables

- `VITE_API_BASE_URL` - Backend API URL (default: `http://localhost:8000`)
- `VITE_WS_BASE_URL` - WebSocket URL (default: `ws://localhost:8000`)

## CORS Configuration

Your Docker backend is already configured to allow requests from `http://localhost:5173`. This is set in:

- Backend `.env` file:
  ```env
  CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
  CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
  ```

## Testing the Connection

### 1. Start Both Services

**Terminal 1 - Backend (Docker):**
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

### 2. Open Browser

Open: **http://localhost:5173**

### 3. Test Features

- ✅ **Home Page** - Should load public games, leaderboard
- ✅ **Login/Register** - Should work with Docker backend
- ✅ **Games** - Should list/create games
- ✅ **WebSocket** - Should connect for real-time features

## Troubleshooting

### Issue: CORS Errors

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**: Check backend CORS configuration:

```bash
cd digichess-backend
docker compose exec backend env | grep CORS

# Should show:
# CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

If missing, update `.env` and restart:
```bash
docker compose restart backend
```

### Issue: API Connection Failed

**Error**: `Network Error` or `Connection Refused`

**Check:**
1. Backend is running: `docker compose ps`
2. Backend is accessible: `curl http://localhost:8000/api/games/public/`
3. Port 8000 is not blocked by firewall

**Solution:**
```bash
# Check backend logs
docker compose logs backend

# Restart backend
docker compose restart backend
```

### Issue: WebSocket Connection Failed

**Error**: WebSocket errors in browser console

**Check:**
1. Backend supports WebSocket (Daphne is running)
2. Redis is running (needed for Channels)
3. WebSocket URL is correct: `ws://localhost:8000`

**Verify:**
```bash
# Check Redis
docker compose ps redis

# Check backend logs for WebSocket connections
docker compose logs backend | grep -i websocket
```

### Issue: Authentication Not Working

**Error**: `401 Unauthorized` or login fails

**Solution:**
1. Check if user exists in backend:
   ```bash
   docker compose exec backend python manage.py shell
   ```
   ```python
   from django.contrib.auth import get_user_model
   User = get_user_model()
   User.objects.all()
   ```

2. Check token storage in browser:
   - Open DevTools → Application → Local Storage
   - Should have `token` key after login

## Production Setup

For production deployment:

### Frontend .env.production
```env
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_WS_BASE_URL=wss://api.yourdomain.com
```

### Backend CORS
Update backend `.env`:
```env
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

## Quick Test Checklist

- [ ] Docker backend is running (`docker compose ps`)
- [ ] Backend API responds (`curl http://localhost:8000/api/games/public/`)
- [ ] Frontend dev server starts (`npm run dev`)
- [ ] Can access frontend at http://localhost:5173
- [ ] Can see public games/leaderboard on home page
- [ ] Can register/login (creates account in Docker backend)
- [ ] WebSocket connections work (check browser console)

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (Vite Dev Server)             │
│  http://localhost:5173                  │
│                                         │
│  - React Application                    │
│  - API Calls → http://localhost:8000    │
│  - WebSocket → ws://localhost:8000      │
└──────────────┬──────────────────────────┘
               │
               │ HTTP/WebSocket
               │
┌──────────────▼──────────────────────────┐
│  Docker Backend                         │
│  http://localhost:8000                  │
│                                         │
│  - Django + Daphne (ASGI)              │
│  - Django REST Framework                │
│  - Django Channels (WebSocket)          │
│  - PostgreSQL (port 5433)               │
│  - Redis (port 6378)                    │
└─────────────────────────────────────────┘
```

## Next Steps

1. ✅ Frontend connected to Docker backend
2. 🔄 Test all features
3. 🔄 Deploy to production (when ready)

Your frontend is ready to connect to the Docker backend! 🚀

