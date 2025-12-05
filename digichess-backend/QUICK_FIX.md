# Quick Fix: Start All Services

## Problem
Only PostgreSQL is running. Other services (Redis, Backend, Celery) need to be started.

## Solution

### Try starting all services:
```bash
cd digichess-frontend/digichess-backend
docker compose up -d
```

### If Redis fails (port conflict):
The error will show Redis port 6378/6379 is already in use.

**Fix:** Update your `.env` file to use a different Redis port:

```bash
# Edit .env file - change Redis port
REDIS_PORT_HOST=6380  # or any available port
```

Then restart:
```bash
docker compose down
docker compose up -d
```

### Check what's running:
```bash
docker compose ps
```

You should see all 5 services:
- ✅ postgres (healthy)
- ✅ redis (healthy) 
- ✅ backend (running)
- ✅ celery (running)
- ✅ celery-beat (running)

### Once all services are up, run migrations:
```bash
docker compose exec backend python manage.py migrate
```

## Check Logs for Errors

If services still won't start, check logs:

```bash
# Check Redis logs
docker compose logs redis

# Check Backend logs  
docker compose logs backend

# Check all logs
docker compose logs
```

