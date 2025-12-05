# Docker Quick Start Guide

Get your DigiChess backend up and running in minutes!

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB of free disk space (for Stockfish build and Maia models)

## Quick Start (5 minutes)

### 1. Set Up Environment

```bash
cd digichess-backend

# Copy example environment file
cp env.example .env

# Edit .env with your settings (at minimum, change DJANGO_SECRET_KEY)
nano .env  # or use your favorite editor
```

### 2. Run Setup Script (Recommended)

```bash
./scripts/docker-setup.sh
```

This script will:
- ✅ Create `.env` file if it doesn't exist
- ✅ Generate Django secret key
- ✅ Build Docker images
- ✅ Start all services
- ✅ Run database migrations
- ✅ Optionally create superuser

### 3. Or Manual Setup

```bash
# Build images (first time: 10-20 minutes)
docker-compose build

# Start all services
docker-compose up -d

# Run migrations
docker-compose exec backend python manage.py migrate

# Create superuser (optional)
docker-compose exec backend python manage.py createsuperuser
```

### 4. Verify Everything is Running

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f backend

# Test API
curl http://localhost:8000/api/games/
```

## Service URLs

Once running, access:

- **Backend API**: http://localhost:8000
- **Admin Panel**: http://localhost:8000/admin
- **API Endpoints**: http://localhost:8000/api/

## Helper Scripts

Located in `scripts/` directory:

```bash
# Setup everything (first time)
./scripts/docker-setup.sh

# View logs
./scripts/docker-logs.sh [service_name]

# Stop services
./scripts/docker-down.sh

# Django shell / management commands
./scripts/docker-shell.sh [service] [command]

# Download Maia models
./scripts/download-maia-models.sh
```

## Common Commands

### Start/Stop Services

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart a service
docker-compose restart backend

# View logs
docker-compose logs -f [service_name]
```

### Database Operations

```bash
# Run migrations
docker-compose exec backend python manage.py migrate

# Create superuser
docker-compose exec backend python manage.py createsuperuser

# Django shell
docker-compose exec backend python manage.py shell

# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d digichess
```

### Maintenance

```bash
# Download Maia models (for human-like bot play)
docker-compose exec backend python manage.py setup_maia --all

# Collect static files
docker-compose exec backend python manage.py collectstatic

# Rebuild after code changes
docker-compose build backend
docker-compose up -d backend
```

## Development Mode

For development with live code reloading:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This mounts your local code directory for live changes.

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Check service status
docker-compose ps

# Restart everything
docker-compose down
docker-compose up -d
```

### Database connection errors

```bash
# Check if postgres is healthy
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres

# Verify environment variables
docker-compose exec backend env | grep DB_
```

### Redis connection errors

```bash
# Check if redis is running
docker-compose ps redis

# Test redis connection
docker-compose exec redis redis-cli ping
```

### Build fails

```bash
# Clean build (removes cache)
docker-compose build --no-cache

# Check disk space
df -h
```

### Port already in use

If port 8000 is already in use, change it in `.env`:

```bash
BACKEND_PORT=8001
```

Then restart services.

## Production Deployment

For production:

1. Update `.env` with production values:
   - Set `DJANGO_DEBUG=False`
   - Use strong `DJANGO_SECRET_KEY`
   - Configure proper `ALLOWED_HOSTS`
   - Set up email service
   - Use strong database passwords

2. Use reverse proxy (Nginx) with SSL

3. Set up backups for:
   - PostgreSQL database
   - Media files volume

4. Monitor logs and set up alerts

See `DOCKER_DEPLOYMENT.md` for detailed production guide.

## Architecture

```
┌─────────────────────────────────────────┐
│  Backend (Django + Daphne) :8000       │
│  - HTTP API                             │
│  - WebSocket connections                │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ PostgreSQL  │  │    Redis    │
│  Database   │  │ Channels +  │
│             │  │  Celery     │
└─────────────┘  └──────┬──────┘
                        │
            ┌───────────┴───────────┐
            │                       │
    ┌───────▼──────┐      ┌────────▼──────┐
    │ Celery Worker│      │ Celery Beat   │
    │ (Async Tasks)│      │ (Scheduled)   │
    └──────────────┘      └───────────────┘
```

## Next Steps

1. ✅ Backend is running
2. 🔄 Set up frontend (React app)
3. 🔄 Configure reverse proxy (Nginx)
4. 🔄 Set up SSL certificates
5. 🔄 Configure domain name

## Support

- Check logs: `docker-compose logs -f`
- Review `DOCKER_DEPLOYMENT.md` for detailed docs
- Check service health: `docker-compose ps`

