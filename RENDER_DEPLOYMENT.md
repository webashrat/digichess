# Render Deployment Guide

## ✅ Chess Engine Paths for Render

These paths are **CORRECT** for Render backend deployment:

```bash
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models
```

### Why These Paths Work

1. **Stockfish** (`/usr/local/bin/stockfish`)
   - Built in Dockerfile and installed to `/usr/local/bin/stockfish`
   - ✅ Correct for Docker/Render deployment

2. **lc0** (`/usr/local/bin/lc0`)
   - Built in Dockerfile and installed to `/usr/local/bin/lc0`
   - ✅ Correct for Docker/Render deployment

3. **Maia Models** (`/app/games/maia_models`)
   - Directory created in Dockerfile (line 77)
   - Models are downloaded at runtime or during build
   - ✅ Correct path inside Docker container

## Render Deployment Setup

### Option 1: Docker Deployment (Recommended)

Render supports Docker deployments. Your Dockerfile is ready!

#### Steps:

1. **Connect Repository to Render**
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - **Name**: `digichess-backend`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your deployment branch)
   - **Root Directory**: `digichess-backend`
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `Dockerfile` (auto-detected)

3. **Environment Variables**

   Set these in Render dashboard:

   ```bash
   # Django
   DJANGO_SECRET_KEY=your-secret-key-here
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=your-app.onrender.com
   
   # Database (PostgreSQL)
   DB_NAME=digichess
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_HOST=your-postgres-host.onrender.com
   DB_PORT=5432
   
   # Redis (if using Render Redis)
   REDIS_URL=redis://your-redis-host.onrender.com:6379/0
   
   # Chess Engines (CORRECT for Docker)
   STOCKFISH_PATH=/usr/local/bin/stockfish
   LC0_PATH=/usr/local/bin/lc0
   MAIA_MODELS_DIR=/app/games/maia_models
   
   # Email
   EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=465
   EMAIL_USE_SSL=True
   EMAIL_HOST_USER=apikey
   EMAIL_HOST_PASSWORD=your-sendgrid-key
   DEFAULT_FROM_EMAIL=noreply@yourdomain.com
   
   # Frontend/API URLs
   FRONTEND_URL=https://your-frontend.onrender.com
   API_BASE_URL=https://your-backend.onrender.com
   
   # CORS
   CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com
   CSRF_TRUSTED_ORIGINS=https://your-frontend.onrender.com
   ```

4. **Build Command** (Auto-detected for Docker)
   - Render will automatically use your Dockerfile

5. **Start Command** (Auto-detected)
   - Dockerfile CMD: `daphne -b 0.0.0.0 -p 8000 config.asgi:application`

6. **Pre-Deploy Command** ⚠️ **NOT NEEDED**
   
   **Answer: NO, you don't need this!**
   
   Your `docker-entrypoint.sh` script already handles:
   - ✅ Database migrations (`python manage.py migrate`)
   - ✅ Static file collection (`python manage.py collectstatic`)
   - ✅ Waiting for database and Redis to be ready
   
   The entrypoint runs automatically every time your container starts, which is better than Pre-Deploy because:
   - Runs on every container restart (not just deployments)
   - Waits for dependencies before running migrations
   - Handles failures gracefully
   
   **Leave Pre-Deploy Command EMPTY** - your entrypoint script handles everything! ✅

7. **Health Check**
   - Render will auto-detect port 8000 from Dockerfile EXPOSE

### Option 2: Native Python Deployment

If not using Docker, you'll need to:

1. Install Stockfish separately (not recommended - complex)
2. Install lc0 separately (not recommended - complex)
3. Update paths accordingly

**Recommendation: Use Docker deployment** ✅

## Database Setup

### Create PostgreSQL Database on Render

1. Go to Render Dashboard
2. Click "New +" → "PostgreSQL"
3. Configure:
   - **Name**: `digichess-db`
   - **Database**: `digichess`
   - **User**: Auto-generated
   - **Password**: Auto-generated (save it!)
   - **Region**: Same as backend

4. Copy connection details to backend environment variables

## Redis Setup (Optional)

### Create Redis Instance on Render

1. Go to Render Dashboard
2. Click "New +" → "Redis"
3. Configure:
   - **Name**: `digichess-redis`
   - **Region**: Same as backend

4. Copy Redis URL to backend environment variables

## Post-Deployment Steps

### 1. Migrations & Static Files ✅ **AUTOMATIC**

**No action needed!** Your `docker-entrypoint.sh` automatically runs:
- ✅ Database migrations (`python manage.py migrate`)
- ✅ Static file collection (`python manage.py collectstatic`)

These run every time your container starts (first deploy and all updates).

### 2. Create Superuser (First Time Only)

After first deployment, create an admin user:

```bash
# Option 1: Via Render Shell (in dashboard)
# Click on your service → "Shell" → Run:
python manage.py createsuperuser

# Option 2: Via local Docker (if you have access)
docker compose exec backend python manage.py createsuperuser
```

### 3. Download Maia Models (Optional)

If using Maia chess:

```bash
# Via Render Shell
python manage.py setup_maia
```

Or models will be downloaded automatically when needed.

## Environment Variables Summary

### Required

- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `REDIS_URL` (if using Redis)
- `FRONTEND_URL`, `API_BASE_URL`

### Chess Engine Paths (Already Set in Dockerfile)

These are **automatically set** in your Dockerfile:

- `STOCKFISH_PATH=/usr/local/bin/stockfish` ✅
- `LC0_PATH=/usr/local/bin/lc0` ✅
- `MAIA_MODELS_DIR=/app/games/maia_models` ✅

**You don't need to set these manually** - they're in the Dockerfile!

### Optional

- `LC0_PATH` - Only needed if lc0 build succeeds (optional)
- Email configuration (SendGrid)
- CORS settings

## Build Time Considerations

### First Build

- **Build time**: ~10-20 minutes
- Compiles Stockfish from source
- Optionally builds lc0 (may fail, that's OK)

### Subsequent Builds

- **Build time**: ~5-10 minutes (with caching)
- Docker layers are cached

## Troubleshooting

### Stockfish Not Found

Check logs:
```bash
docker exec <container> which stockfish
docker exec <container> stockfish bench
```

Should output: `/usr/local/bin/stockfish`

### Maia Models Not Found

Models are downloaded at runtime. Check:
```bash
docker exec <container> ls -la /app/games/maia_models/
```

### Database Connection Issues

- Verify `DB_HOST` includes full Render PostgreSQL hostname
- Check firewall rules (Render PostgreSQL auto-whitelists same-region services)

## Cost Estimation (Render)

- **Web Service**: $7-25/month (depending on tier)
- **PostgreSQL**: $7/month (starter)
- **Redis**: $10/month (starter)
- **Total**: ~$24-42/month

## Next Steps

1. ✅ Connect repository to Render
2. ✅ Create PostgreSQL database
3. ✅ Create Redis instance (optional)
4. ✅ Set environment variables
5. ✅ Deploy!
6. ✅ Run migrations
7. ✅ Create superuser
8. ✅ Test the API

## Notes

- **Static Files**: Render serves static files automatically for Django
- **Media Files**: Consider using S3 or Render's disk for persistent storage
- **WebSockets**: Supported on Render (Daphne/ASGI)
- **Background Tasks**: Celery workers can run as separate services

Your chess engine paths are **correct** - no changes needed! 🎉


