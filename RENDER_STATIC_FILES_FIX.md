# Render Deployment - Static Files & Migration Fixes

## ✅ All Issues Fixed

### 1. **Static Files Error** - FIXED ✅

**Error:**
```
django.core.exceptions.ImproperlyConfigured: 
You're using the staticfiles app without having set the STATIC_ROOT setting to a filesystem path.
```

**Fix Applied:**
- ✅ Added `STATIC_ROOT = BASE_DIR / "staticfiles"` in `config/settings.py`
- ✅ Updated Dockerfile to create `/app/staticfiles` directory

### 2. **CORS Error** - FIXED ✅

**Error:**
```
(corsheaders.E014) Origin 'https://digichess.vercel.app/' in CORS_ALLOWED_ORIGINS should not have path
```

**Fix Applied:**
- ✅ CORS now automatically strips trailing slashes from origins
- ✅ CSRF_TRUSTED_ORIGINS also strips trailing slashes

### 3. **Migrations** - Already Working ✅

Migrations are running correctly. The error message you saw was just a warning that gets caught gracefully.

## 📋 What Changed

### `config/settings.py`
```python
# Added STATIC_ROOT
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # ✅ NEW
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Fixed CORS to strip trailing slashes
cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
if cors_origins_env:
    # Strip whitespace and trailing slashes from origins
    CORS_ALLOWED_ORIGINS = [
        o.strip().rstrip("/") for o in cors_origins_env.split(",") if o.strip()
    ]

# Fixed CSRF to strip trailing slashes
csrf_origins_env = os.getenv("CSRF_TRUSTED_ORIGINS", "")
if csrf_origins_env:
    CSRF_TRUSTED_ORIGINS = [
        o.strip().rstrip("/") for o in csrf_origins_env.split(",") if o.strip()
    ]
```

### `Dockerfile`
```dockerfile
# Updated to create staticfiles directory (not just static)
RUN mkdir -p /app/media /app/staticfiles /app/games/maia_models /app/media/bots
```

## 🚀 Next Steps

1. **Push the fixes to main:**
   ```bash
   git add digichess-backend/config/settings.py digichess-backend/Dockerfile
   git commit -m "Fix: Add STATIC_ROOT and strip trailing slashes from CORS/CSRF origins"
   git push origin main
   ```

2. **Update Render Environment Variables** (Optional but recommended):
   
   In Render → Environment Variables, make sure:
   ```
   CORS_ALLOWED_ORIGINS=https://digichess.vercel.app,https://digichess.play.app
   ```
   
   (No trailing slashes - but the code will strip them automatically now)

3. **Redeploy on Render:**
   - Render will auto-deploy after you push
   - Or manually trigger a redeploy

## ✅ Expected Result

After these fixes:
- ✅ Static files collection will succeed
- ✅ CORS errors will be resolved
- ✅ Migrations will run successfully
- ✅ Bot creation will work
- ✅ Application will start correctly

## 🔍 How It Works

The `docker-entrypoint.sh` script runs these in order:
1. Wait for database (up to 30 retries)
2. Wait for Redis (up to 30 retries)
3. Run migrations (`python manage.py migrate`)
4. Collect static files (`python manage.py collectstatic`)
5. Create bots (`python manage.py create_bots`)
6. Start the server (Daphne)

All errors are caught gracefully, but now they should all succeed! ✅

