# Quick Command Reference

## ✅ Use These Commands (Correct Format)

Your system has **Docker Compose v2.39.4**. Use `docker compose` (with space):

```bash
cd digichess-frontend/digichess-backend

# Build images
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Run migrations
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Stop services
docker compose down

# Check status
docker compose ps
```

## 🚀 Quick Start (3 Commands)

```bash
cd digichess-frontend/digichess-backend

# 1. Build
docker compose build

# 2. Start
docker compose up -d

# 3. Migrate
docker compose exec backend python manage.py migrate
```

## 📝 Alternative: Use Helper Scripts

All scripts automatically detect the correct command:

```bash
cd digichess-frontend/digichess-backend

# Automated setup (does everything)
./scripts/docker-setup.sh

# View logs
./scripts/docker-logs.sh

# Stop services
./scripts/docker-down.sh
```

## ⚠️ What NOT to Use

Don't use `docker-compose` (with hyphen) - that's the old format:

```bash
# ❌ This won't work:
docker-compose build

# ✅ Use this instead:
docker compose build
```

## 🔧 Optional: Create an Alias

If you prefer typing `docker-compose`, create an alias:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias docker-compose='docker compose'

# Then reload
source ~/.bashrc  # or source ~/.zshrc
```

Now both commands work!

## 📚 More Information

See `DOCKER_COMPOSE_SETUP.md` for detailed explanation.

