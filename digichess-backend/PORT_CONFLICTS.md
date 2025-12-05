# Port Conflicts Resolution

## Issue: Port Already in Use

If you see errors like:
```
Error: failed to bind host port 0.0.0.0:5432/tcp: address already in use
```

This means you have a service already running on that port (likely a local PostgreSQL or Redis instance).

## Solutions

### Option 1: Use Different Ports (Recommended)

The docker-compose.yml has been configured to use:
- **PostgreSQL**: Port `5433` on host (maps to `5432` in container)
- **Redis**: Port `6379` on host

If you need to change ports, set them in your `.env` file:

```bash
# In .env file
DB_PORT=5433          # Change if 5433 is also in use
BACKEND_PORT=8000     # Change if 8000 is in use
```

### Option 2: Stop Local Services

If you have local PostgreSQL/Redis running, you can stop them:

```bash
# Stop PostgreSQL (systemd)
sudo systemctl stop postgresql

# Stop Redis (systemd)
sudo systemctl stop redis-server

# Or stop any Docker containers using these ports
docker ps | grep -E '5432|6379'
docker stop <container_id>
```

### Option 3: Use External Database/Redis

You can configure the backend to use your existing PostgreSQL/Redis instead of containers:

1. **Use external PostgreSQL:**
   - Remove or comment out the `postgres` service in docker-compose.yml
   - Set `DB_HOST` in `.env` to your local PostgreSQL host
   - Set `DB_PORT` to `5432` (your local port)

2. **Use external Redis:**
   - Remove or comment out the `redis` service in docker-compose.yml
   - Set `REDIS_URL` in `.env` to your local Redis URL: `redis://localhost:6379/0`

## Current Port Configuration

| Service | Host Port | Container Port | Can Change? |
|---------|-----------|----------------|-------------|
| PostgreSQL | 5433 | 5432 | Yes (via DB_PORT) |
| Redis | 6379 | 6379 | Yes (modify docker-compose.yml) |
| Backend API | 8000 | 8000 | Yes (via BACKEND_PORT) |

## Quick Fix

If you just want to get started quickly, the ports have already been adjusted:

1. **PostgreSQL** now uses port **5433** (so it won't conflict with local PostgreSQL on 5432)
2. The containers still communicate internally on standard ports
3. You only need to change ports if you want to access the database from your host machine

## Verifying Ports

Check what's using ports:

```bash
# Check PostgreSQL port
sudo lsof -i :5432
sudo lsof -i :5433

# Check Redis port
sudo lsof -i :6379

# Check Backend port
sudo lsof -i :8000
```

## After Changes

After fixing port conflicts:

```bash
# Stop any failed containers
docker compose down

# Start again
docker compose up -d

# Check status
docker compose ps
```

