# .env File Errors & Fixes

## ❌ Issues Found in Your .env File

### 1. **DJANGO_SECRET_KEY has quotes** ⚠️
```env
# WRONG:
DJANGO_SECRET_KEY='django-insecure-y&)fapf4imah%769#0su46zuh=7s=l!7%rg6gbshp@@vb2xnec'

# CORRECT:
DJANGO_SECRET_KEY=django-insecure-y&)fapf4imah%769#0su46zuh=7s=l!7%rg6gbshp@@vb2xnec
```
**Fix:** Remove the quotes. Environment variables should not have quotes in .env files.

---

### 2. **DB_HOST is wrong for Docker** 🔴 CRITICAL
```env
# WRONG:
DB_HOST=localhost

# CORRECT (for Docker Compose):
DB_HOST=postgres
```
**Why:** In Docker Compose, containers communicate using service names, not `localhost`. The `docker-compose.yml` actually overrides this anyway, but it's good to set it correctly.

**Note:** `docker-compose.yml` line 56 overrides this to `postgres` automatically, but having it correct here prevents confusion.

---

### 3. **DB_PORT mismatch** ⚠️
```env
# CURRENT:
DB_PORT=5433

# SHOULD BE (for container communication):
DB_PORT=5432
```
**Why:** 
- `5433` is the **host port** (for accessing from your machine)
- `5432` is the **container port** (what containers use internally)
- `docker-compose.yml` overrides this to `5432` anyway, but set it correctly

**Solution:** Add separate variable:
```env
DB_PORT=5432          # Container port (used by containers)
DB_PORT_HOST=5433     # Host port (for accessing from your machine)
```

---

### 4. **STOCKFISH_PATH is wrong for Docker** 🔴 CRITICAL
```env
# WRONG:
STOCKFISH_PATH=/home/rajanand/digichess-backend/Stockfish/src/stockfish

# CORRECT (for Docker):
STOCKFISH_PATH=/usr/local/bin/stockfish
```
**Why:** The path `/home/rajanand/digichess-backend/...` is a **host path** that doesn't exist inside the Docker container. Inside the container, Stockfish is installed at `/usr/local/bin/stockfish`.

---

### 5. **Missing DJANGO_ALLOWED_HOSTS** ⚠️
```env
# ADD THIS:
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,*
```
**Why:** Django needs this to accept requests. For development, `*` works but `localhost,127.0.0.1` is safer.

---

### 6. **REDIS_PORT variable name** ⚠️
```env
# CURRENT:
REDIS_PORT=6378

# SHOULD MATCH docker-compose.yml:
REDIS_PORT_HOST=6378
```
**Why:** `docker-compose.yml` uses `${REDIS_PORT_HOST:-6378}` (line 31), so the variable name should match. Actually, your current name works because docker-compose has a default, but let's be consistent.

---

### 7. **Commented DB_HOST line** ℹ️
```env
#DB_HOST=host.docker.internal
```
This line is commented out, which is fine, but if you're not using it, you can remove it.

---

## ✅ Corrected .env File

Here's your corrected `.env` file with all fixes:

```env
# Django Core
DJANGO_SECRET_KEY=django-insecure-y&)fapf4imah%769#0su46zuh=7s=l!7%rg6gbshp@@vb2xnec
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,*

# Database (docker-compose will override DB_HOST and DB_PORT)
DB_NAME=cdc
DB_USER=postgres
DB_PASSWORD=12345
DB_HOST=postgres
DB_PORT=5432
DB_PORT_HOST=5433

# Redis
REDIS_URL=redis://redis:6379/0
REDIS_PORT_HOST=6378

# Frontend URLs
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:8000

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# OTP
OTP_EXPIRY_MINUTES=10

# Email
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=465
EMAIL_USE_TLS=False
EMAIL_USE_SSL=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=your_sendgrid_api_key_here
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
SERVER_EMAIL=noreply@yourdomain.com
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Chess Engines (Docker paths)
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models

# Docker Ports
BACKEND_PORT=8000
DB_PORT_HOST=5433
REDIS_PORT_HOST=6378
```

---

## 🔧 Quick Fix Commands

Run these commands to fix your `.env` file:

```bash
cd digichess-frontend/digichess-backend

# Backup your current .env
cp .env .env.backup

# Fix the issues (using sed)
sed -i "s/^DJANGO_SECRET_KEY=.*/DJANGO_SECRET_KEY=django-insecure-y\&)fapf4imah%769#0su46zuh=7s=l!7%rg6gbshp@@vb2xnec/" .env
sed -i 's/^DB_HOST=localhost$/DB_HOST=postgres/' .env
sed -i 's/^DB_PORT=5433$/DB_PORT=5432/' .env
sed -i 's|^STOCKFISH_PATH=.*|STOCKFISH_PATH=/usr/local/bin/stockfish|' .env

# Add missing DJANGO_ALLOWED_HOSTS if not present
if ! grep -q "^DJANGO_ALLOWED_HOSTS=" .env; then
    echo "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,*" >> .env
fi

# Add DB_PORT_HOST if not present
if ! grep -q "^DB_PORT_HOST=" .env; then
    echo "DB_PORT_HOST=5433" >> .env
fi

# Update REDIS_PORT to REDIS_PORT_HOST
sed -i 's/^REDIS_PORT=/REDIS_PORT_HOST=/' .env
```

Or manually edit `.env` and make these changes:
1. Remove quotes from `DJANGO_SECRET_KEY`
2. Change `DB_HOST=localhost` to `DB_HOST=postgres`
3. Change `DB_PORT=5433` to `DB_PORT=5432`
4. Change `STOCKFISH_PATH` to `/usr/local/bin/stockfish`
5. Add `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,*`
6. Change `REDIS_PORT=6378` to `REDIS_PORT_HOST=6378`
7. Add `DB_PORT_HOST=5433`

---

## 📝 Important Notes

1. **docker-compose.yml overrides some values** - It sets `DB_HOST=postgres` and `DB_PORT=5432` automatically, but having them correct in `.env` is best practice.

2. **STOCKFISH_PATH is critical** - This will cause failures if wrong. Inside Docker, it's always `/usr/local/bin/stockfish`.

3. **Port mappings:**
   - Host port 5433 → Container port 5432 (PostgreSQL)
   - Host port 6378 → Container port 6379 (Redis)
   - Host port 8000 → Container port 8000 (Backend)

4. **Email configuration looks correct** - Port 465 with SSL is fine for SendGrid.

---

## ✅ After Fixes

After making these changes:

```bash
# Restart services
docker compose down
docker compose up -d

# Check logs
docker compose logs -f backend

# Test
curl http://localhost:8000/api/games/
```

