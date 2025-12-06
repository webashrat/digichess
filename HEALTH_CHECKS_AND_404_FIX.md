# Health Checks and 404 Error Fix

## Summary

This document explains the fixes for:
1. **404 Error** when accessing `/games/1` endpoint
2. **Celery Health Checks** - Added comprehensive service status monitoring

---

## 1. Celery Health Checks Added ✅

### What Was Added

Enhanced the `/readyz/` endpoint to check all critical services:

- ✅ **Database** - Connection check
- ✅ **Redis** - Connection check (with TLS/SSL support)
- ✅ **Celery Worker** - Active workers inspection
- ✅ **Celery Beat** - Beat scheduler status check

### Health Check Endpoints

#### Basic Health Check: `/healthz/`
- Checks database connection only
- Returns 200 if healthy, 500 if unhealthy
- Used by load balancers for basic health monitoring

#### Comprehensive Readiness Check: `/readyz/`
- Checks all critical services:
  - Database
  - Redis
  - Celery Worker (with worker count)
  - Celery Beat
- Returns 200 if all services ready, 503 if any service unavailable
- Includes detailed status for each service

### Example Response

```json
{
  "status": "ready",
  "service": "digichess-backend",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "celery_worker": {
      "status": "running",
      "worker_count": 1,
      "workers": ["celery@hostname"]
    },
    "celery_beat": "running"
  }
}
```

### How It Works

1. **Database Check**: Executes `SELECT 1` query
2. **Redis Check**: Pings Redis server (supports TLS/SSL and password auth)
3. **Celery Worker Check**: Uses Celery's inspect API to find active workers
4. **Celery Beat Check**: Checks for beat lock in Redis (Celery Beat stores its lock there)

### Usage

```bash
# Check basic health
curl https://digichess.onrender.com/healthz/

# Check full readiness (includes Celery status)
curl https://digichess.onrender.com/readyz/
```

---

## 2. 404 Error Investigation 🔍

### The Problem

When accessing `https://digichess.vercel.app/games/1`, you get a 404 error.

### Root Cause Analysis

The endpoint `/api/games/<id>/` exists and requires:
- ✅ Authentication (`permissions.IsAuthenticated`)
- ✅ Valid game ID
- ✅ User must be part of the game (for active/pending games)

### Possible Causes

1. **Frontend API Base URL Not Configured**
   - Frontend uses `VITE_API_BASE_URL` environment variable
   - If not set in Vercel, defaults to `http://localhost:8000`
   - This causes API calls to fail in production

2. **CORS Issues**
   - Backend must allow requests from `https://digichess.vercel.app`
   - Check `CORS_ALLOWED_ORIGINS` in backend settings

3. **Authentication Missing**
   - User not logged in
   - Token expired or invalid
   - Token not sent in request headers

4. **Game Access Permission**
   - For active/pending games, only players can view
   - Completed/aborted games are viewable by anyone (spectators)

### How to Debug

#### 1. Check Frontend API Configuration

In Vercel Dashboard → Your Project → Settings → Environment Variables:

```bash
VITE_API_BASE_URL=https://digichess.onrender.com
VITE_WS_BASE_URL=wss://digichess.onrender.com
```

#### 2. Check Backend CORS Settings

In Render Dashboard → Your Service → Environment:

```bash
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app
CSRF_TRUSTED_ORIGINS=https://digichess.vercel.app
```

Make sure there are **NO trailing slashes** in the URLs!

#### 3. Check Authentication

In browser DevTools → Network tab:
- Look for `Authorization: Token <token>` header
- Check if token exists in localStorage
- Verify token is valid and not expired

#### 4. Test API Directly

```bash
# Test with authentication
curl -H "Authorization: Token YOUR_TOKEN" \
     https://digichess.onrender.com/api/games/1/

# Should return game details or 404 if game doesn't exist
```

### Expected API Response

**Success (200)**:
```json
{
  "id": 1,
  "white": {...},
  "black": {...},
  "status": "active",
  ...
}
```

**404 - Game Not Found**:
```json
{
  "detail": "Not found."
}
```

**403 - Not Authorized**:
```json
{
  "detail": "You are not part of this game."
}
```

**401 - Authentication Required**:
```json
{
  "detail": "Authentication credentials were not provided."
}
```

---

## 3. Files Changed

### Backend

1. **`digichess-backend/config/views.py`**
   - Added comprehensive health checks
   - Added Redis, Celery Worker, and Celery Beat status checks
   - Enhanced `/readyz/` endpoint with detailed service status

2. **`digichess-backend/config/urls.py`**
   - Added trailing slashes to health check URLs (`/healthz/`, `/readyz/`)

---

## 4. Next Steps

### For the 404 Error:

1. ✅ Verify `VITE_API_BASE_URL` is set in Vercel
2. ✅ Verify `CORS_ALLOWED_ORIGINS` includes your frontend URL
3. ✅ Check browser DevTools Network tab for actual error
4. ✅ Test API endpoint directly with curl/Postman
5. ✅ Verify user is authenticated and has access to the game

### For Health Checks:

1. ✅ Test `/readyz/` endpoint after deployment
2. ✅ Monitor service status in logs
3. ✅ Set up alerts based on health check status

---

## 5. Testing Health Checks

After deployment, you can test the health checks:

```bash
# Basic health (database only)
curl https://digichess.onrender.com/healthz/

# Full readiness (all services)
curl https://digichess.onrender.com/readyz/
```

You should see output like:
```
Database is ready!
Waiting for Redis...
Redis is ready!
```

And in the `/readyz/` response, you'll see Celery Worker and Celery Beat status.

---

## 6. Monitoring

The `/readyz/` endpoint can be used by:
- Render health checks (configure in Render dashboard)
- Monitoring tools (Prometheus, Datadog, etc.)
- Load balancers
- CI/CD pipelines

Set Render Health Check Path to: `/readyz/`

