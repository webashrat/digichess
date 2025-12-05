# Docker Compose Setup Guide

## Important: Docker Compose Command Format

Modern Docker (version 20.10+) uses **`docker compose`** (with a space) instead of the old **`docker-compose`** (with a hyphen).

### Check Your Version

```bash
# Check Docker version
docker --version

# Check Docker Compose version (plugin)
docker compose version

# If the above works, you have the modern version!
```

### Using Docker Compose

Your system has **Docker Compose v2.39.4** installed as a plugin. Use these commands:

```bash
# Instead of: docker-compose build
docker compose build

# Instead of: docker-compose up
docker compose up -d

# Instead of: docker-compose down
docker compose down

# Instead of: docker-compose logs
docker compose logs -f
```

## Quick Fix

You have two options:

### Option 1: Use `docker compose` directly (Recommended)

Simply replace `docker-compose` with `docker compose` in all commands:

```bash
cd digichess-backend

# Build images
docker compose build

# Start services
docker compose up -d

# Run migrations
docker compose exec backend python manage.py migrate
```

### Option 2: Create an alias

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
alias docker-compose='docker compose'
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

Now `docker-compose` will work and call `docker compose` automatically.

## Updated Helper Scripts

All helper scripts in `scripts/` have been updated to automatically use the correct command. Just run:

```bash
./scripts/docker-setup.sh
```

The scripts will automatically detect and use `docker compose` or `docker-compose` depending on what's available.

## Quick Start (Correct Commands)

```bash
cd digichess-backend

# 1. Set up environment
cp env.example .env
# Edit .env file with your settings

# 2. Build and start
docker compose build
docker compose up -d

# 3. Run migrations
docker compose exec backend python manage.py migrate

# 4. Create superuser (optional)
docker compose exec backend python manage.py createsuperuser
```

That's it! Your backend should be running at http://localhost:8000

## Command Reference

| Old Command | New Command |
|------------|-------------|
| `docker-compose build` | `docker compose build` |
| `docker-compose up -d` | `docker compose up -d` |
| `docker-compose down` | `docker compose down` |
| `docker-compose ps` | `docker compose ps` |
| `docker-compose logs -f` | `docker compose logs -f` |
| `docker-compose exec backend ...` | `docker compose exec backend ...` |
| `docker-compose restart` | `docker compose restart` |

## Troubleshooting

### "Command 'docker-compose' not found"

This is normal! You need to use `docker compose` (with space) instead.

### "Command 'docker compose' not found"

Your Docker installation might be too old. Update Docker:

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose-plugin
```

Or install Docker Compose standalone as a fallback:

```bash
sudo apt install docker-compose
```

