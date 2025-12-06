# Render Celery Worker & Beat Setup

## 🔍 Current Situation

**On Render, you only have ONE web service running:**
- ✅ **Daphne** (Django ASGI server) - Running via Dockerfile CMD
- ❌ **Celery Worker** - NOT running
- ❌ **Celery Beat** - NOT running

**Local docker-compose has:**
- ✅ Backend (Daphne)
- ✅ Celery Worker
- ✅ Celery Beat

## ⚠️ Problem

Render's single web service only runs ONE process (Daphne). Celery worker and beat need to run separately.

## ✅ Solutions

You have **two options**:

### Option 1: Separate Render Services (Recommended)

Create **3 separate services** on Render:

1. **Web Service** - Runs Daphne
2. **Background Worker** - Runs Celery Worker
3. **Background Worker** - Runs Celery Beat

### Option 2: Single Service with Process Manager

Use `supervisord` to run all 3 processes in one container (less recommended for production).

## 🚀 Recommended: Option 1 - Separate Services

### Step 1: Update docker-compose.yml (for reference)

First, let's update the commands to match what you want:

```yaml
celery:
  command: celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4

celery-beat:
  command: celery -A config beat -l info
```

### Step 2: Create 3 Services on Render

#### Service 1: Web Service (Daphne)
- **Type**: Web Service
- **Name**: `digichess-backend`
- **Dockerfile Path**: `digichess-backend/Dockerfile`
- **Root Directory**: `digichess-backend`
- **Docker Command**: (leave empty - uses Dockerfile CMD)
- ✅ This runs: `daphne -b 0.0.0.0 -p 8000 config.asgi:application`

#### Service 2: Background Worker (Celery Worker)
- **Type**: Background Worker
- **Name**: `digichess-celery-worker`
- **Dockerfile Path**: `digichess-backend/Dockerfile`
- **Root Directory**: `digichess-backend`
- **Docker Command**: `celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4`
- ✅ This runs: Celery worker

#### Service 3: Background Worker (Celery Beat)
- **Type**: Background Worker
- **Name**: `digichess-celery-beat`
- **Dockerfile Path**: `digichess-backend/Dockerfile`
- **Root Directory**: `digichess-backend`
- **Docker Command**: `celery -A config beat -l info`
- ✅ This runs: Celery beat scheduler

## 📋 Commands You Want

Based on your requirements:

```bash
# Daphne (already running)
daphne -b 0.0.0.0 -p 8000 config.asgi:application

# Celery Worker (needs to be added)
celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4

# Celery Beat (needs to be added)
celery -A config beat -l info
```

## 🔧 What Needs to be Updated

1. **docker-compose.yml** - Update Celery worker command to match your requirements
2. **Create Render Background Worker services** - For Celery worker and beat

## ⚡ Quick Steps

1. Update `docker-compose.yml` Celery worker command
2. Create Background Worker service on Render for Celery worker
3. Create Background Worker service on Render for Celery beat
4. All services use the same Dockerfile, just different commands

