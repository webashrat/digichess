# Render Deployment Fixes - Environment Variables

## 🔍 Issues Found

1. **CORS Error**: `Origin 'https://digichess.vercel.app/' should not have path`
   - Your CORS_ALLOWED_ORIGINS has a trailing slash
   - Fixed in code to auto-strip slashes

2. **Static Files Error**: `STATIC_ROOT setting` missing
   - Fixed in code

## ✅ What I Fixed in Code

1. ✅ Added `STATIC_ROOT = BASE_DIR / "staticfiles"`
2. ✅ Updated CORS to automatically strip trailing slashes
3. ✅ Updated CSRF to automatically strip trailing slashes

## ⚠️ What You Need to Fix in Render

### Update Environment Variables

In Render → Your Service → Environment Variables, check:

### 1. **CORS_ALLOWED_ORIGINS**

**Current (WRONG):**
```
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app/
```

**Should be (NO trailing slash):**
```
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app
```

**Or if you have multiple:**
```
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app,https://digichess.play.app
```

### 2. **CSRF_TRUSTED_ORIGINS**

**Should match CORS (NO trailing slashes):**
```
CSRF_TRUSTED_ORIGINS=https://digichess.vercel.app,https://digichess.play.app
```

## 📋 Complete Environment Variables for Render

Based on your setup:

```bash
# Django
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=digichess.onrender.com

# CORS (NO trailing slashes!)
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app,https://digichess.play.app
CSRF_TRUSTED_ORIGINS=https://digichess.vercel.app,https://digichess.play.app

# Database
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_HOST=your-postgres-host.onrender.com
DB_PORT=5432

# Redis
REDIS_URL=redis://your-redis-service:6379/0

# API URLs
API_BASE_URL=https://digichess.onrender.com
FRONTEND_URL=https://digichess.vercel.app
```

## 🎯 Key Points

- ✅ **NO trailing slashes** in CORS/CSRF URLs
- ✅ After code fix is pushed, trailing slashes will be auto-stripped anyway
- ✅ But it's better to set them correctly

## 🚀 After Fixing

1. Update environment variables in Render
2. Push the code fixes
3. Redeploy
4. Errors should be gone!

