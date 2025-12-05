# Docker Deployment Guide

This guide explains how to deploy the DigiChess backend using Docker.

## Overview

The Dockerfile creates a production-ready Django backend container with:
- ✅ **Stockfish** chess engine (compiled from source)
- ⚙️ **lc0** chess engine (optional, for Maia neural network support)
- ✅ **Django + Daphne** (ASGI server for WebSocket support)
- ✅ **All Python dependencies** installed
- ✅ **Database migrations** run automatically on startup
- ✅ **Health checks** for database and Redis

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL database (can be in a container or external)
- Redis server (can be in a container or external)

## Quick Start

### 1. Build the Docker Image

From the `digichess-backend` directory:

```bash
docker build -t digichess-backend .
```

**Note:** The first build will take 10-20 minutes as it compiles Stockfish and optionally lc0. Subsequent builds are faster due to Docker layer caching.

### 2. Environment Variables

Create a `.env` file in the `digichess-backend` directory with required settings:

```bash
# Database
DB_NAME=digichess
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=postgres
DB_PORT=5432

# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Redis
REDIS_URL=redis://redis:6379/0

# Frontend URL (for CORS)
FRONTEND_URL=https://yourdomain.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Email (optional)
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=your_sendgrid_api_key
DEFAULT_FROM_EMAIL=noreply@yourdomain.com

# Chess Engines (auto-configured, but can override)
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models
```

### 3. Run the Container

```bash
docker run -d \
  --name digichess-backend \
  --env-file .env \
  -p 8000:8000 \
  --restart unless-stopped \
  digichess-backend
```

### 4. Run with Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: digichess
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env
    environment:
      DB_HOST: postgres
      REDIS_URL: redis://redis:6379/0
    ports:
      - "8000:8000"
    volumes:
      - media_data:/app/media
      - static_data:/app/static
      - maia_models:/app/games/maia_models
    restart: unless-stopped

  celery:
    build: .
    command: celery -A config worker -l info
    depends_on:
      - postgres
      - redis
    env_file:
      - .env
    environment:
      DB_HOST: postgres
      REDIS_URL: redis://redis:6379/0
    volumes:
      - media_data:/app/media
    restart: unless-stopped

  celery-beat:
    build: .
    command: celery -A config beat -l info
    depends_on:
      - postgres
      - redis
    env_file:
      - .env
    environment:
      DB_HOST: postgres
      REDIS_URL: redis://redis:6379/0
    volumes:
      - celery_beat_data:/app
    restart: unless-stopped

volumes:
  postgres_data:
  media_data:
  static_data:
  maia_models:
  celery_beat_data:
```

Then run:

```bash
docker-compose up -d
```

## Features

### Automatic Setup

The container automatically:
- ✅ Waits for database and Redis to be ready
- ✅ Runs database migrations on startup
- ✅ Collects static files
- ✅ Starts the Django ASGI server (Daphne)

### Chess Engines

**Stockfish** is always compiled and available. It's used for:
- Bot moves (ratings 1900-2500)
- Game analysis
- Fallback if Maia is unavailable

**lc0** is optionally built (if build succeeds). It enables:
- Maia neural network models (human-like bot play for ratings 800-1900)
- If lc0 build fails, the system continues with Stockfish only

### Maia Models

Maia models are stored in `/app/games/maia_models/`. To download them:

```bash
# Inside the container
docker exec -it digichess-backend python manage.py setup_maia --all

# Or mount the models as a volume and download them locally
```

## Running Commands

### Django Management Commands

```bash
# Create superuser
docker exec -it digichess-backend python manage.py createsuperuser

# Run migrations manually
docker exec -it digichess-backend python manage.py migrate

# Download Maia models
docker exec -it digichess-backend python manage.py setup_maia --all

# Django shell
docker exec -it digichess-backend python manage.py shell
```

### Check Logs

```bash
# Backend logs
docker logs -f digichess-backend

# Celery logs
docker logs -f digichess-celery

# All services (docker-compose)
docker-compose logs -f
```

## Production Considerations

### 1. Static Files

For production, consider:
- Serving static files via Nginx/CDN
- Using `STATIC_ROOT` setting
- Running `collectstatic` during build or as a separate step

### 2. Media Files

Media files should be:
- Stored in a persistent volume
- Or uploaded to cloud storage (S3, etc.)
- Configure `MEDIA_ROOT` accordingly

### 3. Scaling

For multiple backend instances:
- Use Redis Channels layer (already configured)
- Use a load balancer with sticky sessions for WebSockets
- Or use a WebSocket-aware proxy (Nginx, Traefik)

### 4. SSL/HTTPS

Use a reverse proxy (Nginx, Traefik) with SSL certificates (Let's Encrypt).

### 5. Health Checks

The container includes health checks. Add to docker-compose:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health/"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Troubleshooting

### Build Issues

**Stockfish build fails:**
- Check build logs: `docker build -t digichess-backend . 2>&1 | tee build.log`
- Ensure build dependencies are installed
- Try building with fewer parallel jobs: `make -j2` instead of `make -j$(nproc)`

**lc0 build fails:**
- This is OK! The system works without lc0
- Stockfish will be used as fallback
- Check logs for specific error messages

### Runtime Issues

**Database connection errors:**
- Check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` env vars
- Ensure database is accessible from container
- Check network connectivity: `docker exec -it digichess-backend ping postgres`

**Redis connection errors:**
- Check `REDIS_URL` env var
- Ensure Redis is running and accessible
- Test connection: `docker exec -it digichess-backend python -c "import redis; r=redis.from_url('redis://redis:6379/0'); print(r.ping())"`

**WebSocket not working:**
- Ensure Redis Channels layer is configured
- Check Redis connectivity
- Verify ASGI application is running (Daphne)

## Development vs Production

### Development

```bash
# Run with debug mode
docker run -e DJANGO_DEBUG=True -p 8000:8000 digichess-backend

# Mount code for live reload (not recommended for production)
docker run -v $(pwd):/app -e DJANGO_DEBUG=True -p 8000:8000 digichess-backend
```

### Production

- Set `DJANGO_DEBUG=False`
- Use proper secret keys
- Configure `ALLOWED_HOSTS`
- Use HTTPS
- Set up proper logging
- Use process manager (supervisor, systemd) or orchestration (Kubernetes)

## Next Steps

1. **Set up frontend deployment** - Build React app and serve via Nginx
2. **Configure reverse proxy** - Nginx/Traefik for SSL and routing
3. **Set up monitoring** - Logs, metrics, error tracking
4. **Backup strategy** - Database backups, media files
5. **Scaling** - Multiple instances, load balancing

## Support

For issues or questions:
1. Check logs: `docker logs digichess-backend`
2. Review environment variables
3. Check database/Redis connectivity
4. Verify chess engines: `docker exec -it digichess-backend stockfish` and `docker exec -it digichess-backend lc0 --help`

