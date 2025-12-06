# Render FREE Setup - All Services in One Container

## 🎯 Solution: Run Everything in ONE Service (FREE!)

Since Render Background Workers cost money, we'll run **all three services in a single container**:

- ✅ **Daphne** (Django ASGI server)
- ✅ **Celery Worker** 
- ✅ **Celery Beat**

**Only ONE Render Web Service needed - completely FREE!** 🎉

## ✅ What Was Created

1. **`docker-start-all.sh`** - Startup script that runs all services
2. **Updated Dockerfile** - Includes the startup script
3. **Updated docker-compose.yml** - Uses correct Celery commands for local dev

## 🚀 How to Use on Render

### Step 1: Update Render Web Service

Go to your Render Web Service settings and update:

- **Docker Command**: `/start-all.sh`

This will:
1. ✅ Run database migrations (via entrypoint)
2. ✅ Collect static files
3. ✅ Create bots
4. ✅ Start Celery Worker
5. ✅ Start Celery Beat
6. ✅ Start Daphne (keeps container alive)

### Step 2: Deploy

Render will automatically rebuild and deploy. That's it! ✅

## 📋 What Runs

When you set Docker Command to `/start-all.sh`, it will:

1. **Celery Worker**: 
   ```bash
   celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4
   ```

2. **Celery Beat**:
   ```bash
   celery -A config beat -l info
   ```

3. **Daphne**:
   ```bash
   daphne -b 0.0.0.0 -p 8000 config.asgi:application
   ```

## 🔍 Render Configuration

In Render Dashboard → Your Service → Settings:

| Setting | Value |
|---------|-------|
| **Runtime** | Docker |
| **Root Directory** | `digichess-backend` |
| **Dockerfile Path** | `Dockerfile` |
| **Docker Command** | `/start-all.sh` ⭐ |

## ✅ Benefits

- 💰 **FREE** - Only one service needed
- ✅ All services run together
- ✅ Automatic setup (migrations, static files, bots)
- ✅ Graceful shutdown handling
- ✅ Works with existing entrypoint script

## 🧪 Testing Locally

You can test locally with Docker:

```bash
# Build and run with startup script
docker build -t digichess-backend -f digichess-backend/Dockerfile digichess-backend/
docker run -p 8000:8000 \
  -e DB_HOST=your-db-host \
  -e DB_NAME=your-db \
  -e DB_USER=your-user \
  -e DB_PASSWORD=your-password \
  -e REDIS_URL=your-redis-url \
  digichess-backend /start-all.sh
```

## 📊 Service Status

All three services will show in logs:

```
=========================================
Starting DigiChess All Services
=========================================
[1/3] Starting Celery Worker...
   ✓ Celery Worker started (PID: X)
[2/3] Starting Celery Beat...
   ✓ Celery Beat started (PID: Y)
[3/3] Waiting for Celery services to initialize...
=========================================
Starting Daphne (ASGI server) on port 8000...

✅ All services are now running:
   • Daphne (ASGI) - Port 8000
   • Celery Worker - Queues: scm_default, scm_emails
   • Celery Beat - Scheduler
=========================================
```

## ⚠️ Important Notes

1. **One Container**: All services share the same container resources
2. **Memory Usage**: Make sure your Render plan has enough memory (recommended: 512MB+)
3. **Logs**: All services log to the same output (mixed logs)
4. **Scaling**: If you need to scale, you'll scale all services together

## 🎯 Summary

- ✅ Created `docker-start-all.sh` script
- ✅ Updated Dockerfile to include it
- ✅ Set Render Docker Command to `/start-all.sh`
- ✅ All three services run in one free container!

**No additional Background Worker services needed!** 🚀

