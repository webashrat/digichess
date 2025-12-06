# Celery Worker & Beat Setup - Complete Guide

## ✅ Current Status

### Local (Docker Compose)
- ✅ **Daphne**: Running via Dockerfile CMD
- ✅ **Celery Worker**: `celery -A config worker -l info --concurrency=2` → **UPDATED** to `celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4`
- ✅ **Celery Beat**: `celery -A config beat -l info`

### Render (Production) ⚠️
- ✅ **Daphne**: Running via Dockerfile CMD (web service)
- ❌ **Celery Worker**: **NOT RUNNING** - Needs to be added!
- ❌ **Celery Beat**: **NOT RUNNING** - Needs to be added!

## 📋 Your Required Commands

1. ✅ **Daphne** (already running):
   ```bash
   daphne -b 0.0.0.0 -p 8000 config.asgi:application
   ```

2. ✅ **Celery Worker** (updated in docker-compose.yml):
   ```bash
   celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4
   ```
   - Queues: `scm_default`, `scm_emails`
   - Concurrency: 4 workers

3. ✅ **Celery Beat** (already correct):
   ```bash
   celery -A config beat -l info
   ```

## 🔧 What Was Updated

### ✅ docker-compose.yml
Changed Celery worker command from:
```yaml
command: celery -A config worker -l info --concurrency=2
```

To:
```yaml
command: celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4
```

## 🚀 Render Setup Required

**On Render, you need to create 2 additional Background Worker services:**

### Step 1: Create Celery Worker Service

1. Go to Render Dashboard
2. Click **"New +"** → **"Background Worker"**
3. Configure:
   - **Name**: `digichess-celery-worker`
   - **Repository**: Same as your web service
   - **Branch**: `main`
   - **Root Directory**: `digichess-backend`
   - **Dockerfile Path**: `Dockerfile`
   - **Docker Command**: `celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4`
   - **Environment Variables**: Copy all from your web service (DB, Redis, etc.)

### Step 2: Create Celery Beat Service

1. Go to Render Dashboard
2. Click **"New +"** → **"Background Worker"**
3. Configure:
   - **Name**: `digichess-celery-beat`
   - **Repository**: Same as your web service
   - **Branch**: `main`
   - **Root Directory**: `digichess-backend`
   - **Dockerfile Path**: `Dockerfile`
   - **Docker Command**: `celery -A config beat -l info`
   - **Environment Variables**: Copy all from your web service (DB, Redis, etc.)

## 📊 Summary

| Service | Type | Command | Status |
|---------|------|---------|--------|
| **Daphne** | Web Service | `daphne -b 0.0.0.0 -p 8000 config.asgi:application` | ✅ Running |
| **Celery Worker** | Background Worker | `celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4` | ❌ Need to create |
| **Celery Beat** | Background Worker | `celery -A config beat -l info` | ❌ Need to create |

## ⚡ Quick Checklist

- [x] Updated docker-compose.yml Celery worker command
- [ ] Create Render Background Worker for Celery worker
- [ ] Create Render Background Worker for Celery beat
- [ ] Copy environment variables to both new services
- [ ] Deploy and verify all services are running

## 🎯 After Setup

You'll have **3 services on Render**:
1. **Web Service** (`digichess-backend`) - Runs Daphne
2. **Background Worker** (`digichess-celery-worker`) - Runs Celery worker
3. **Background Worker** (`digichess-celery-beat`) - Runs Celery beat scheduler

All three will use the same Dockerfile but run different commands! ✅

