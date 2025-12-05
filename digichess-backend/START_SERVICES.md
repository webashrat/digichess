# Starting All Services - Troubleshooting Guide

## Current Status
Only PostgreSQL is running. Other services (Redis, Backend, Celery) are not running.

## Quick Fix

### Step 1: Start all services
```bash
cd digichess-frontend/digichess-backend
docker compose up -d
```

### Step 2: Check service status
```bash
docker compose ps
```

### Step 3: Check logs if services fail
```bash
# Check all logs
docker compose logs

# Check specific service logs
docker compose logs redis
docker compose logs backend
docker compose logs celery
```

## Common Issues

### Issue 1: Redis Port Conflict
If Redis fails with port already in use error:

**Solution 1: Change Redis port in .env**
```bash
# Edit .env file
REDIS_PORT_HOST=6379  # or another port like 6380
```

Then restart:
```bash
docker compose down
docker compose up -d
```

**Solution 2: Stop local Redis**
```bash
# Stop local Redis if running
sudo systemctl stop redis-server
# or
sudo systemctl stop redis
```

### Issue 2: Backend depends on Redis
Backend won't start if Redis is not healthy.

**Check Redis status:**
```bash
docker compose ps redis
docker compose logs redis
```

**Wait for Redis to be healthy, then start backend:**
```bash
# Wait a few seconds for Redis
sleep 5
docker compose up -d backend
```

### Issue 3: Build issues
If services need to be rebuilt:

```bash
docker compose build
docker compose up -d
```

## Step-by-Step Startup

1. **Stop everything first:**
   ```bash
   docker compose down
   ```

2. **Start services one by one to see errors:**
   ```bash
   # Start PostgreSQL
   docker compose up -d postgres
   
   # Wait for PostgreSQL to be healthy (about 10 seconds)
   sleep 10
   
   # Start Redis
   docker compose up -d redis
   
   # Wait for Redis to be healthy (about 5 seconds)
   sleep 5
   
   # Start Backend (depends on postgres and redis)
   docker compose up -d backend
   
   # Start Celery services
   docker compose up -d celery celery-beat
   ```

3. **Check status:**
   ```bash
   docker compose ps
   ```

   You should see all services running:
   - ✅ digichess-postgres (healthy)
   - ✅ digichess-redis (healthy)
   - ✅ digichess-backend (running)
   - ✅ digichess-celery (running)
   - ✅ digichess-celery-beat (running)

4. **Run migrations:**
   ```bash
   docker compose exec backend python manage.py migrate
   ```

## Verify Everything Works

```bash
# Check all services are up
docker compose ps

# Check backend logs
docker compose logs backend

# Test API
curl http://localhost:8000/api/games/

# Check Redis
docker compose exec redis redis-cli ping
# Should return: PONG
```

## If Services Keep Failing

Check logs for specific errors:
```bash
# View all logs
docker compose logs

# View last 50 lines of backend logs
docker compose logs --tail=50 backend

# Follow logs in real-time
docker compose logs -f
```

Common errors:
- **Port conflicts**: Change ports in .env
- **Database connection errors**: Check DB credentials in .env
- **Redis connection errors**: Check Redis is running and healthy
- **Build errors**: Rebuild images with `docker compose build --no-cache`

