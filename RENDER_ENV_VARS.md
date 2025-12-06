# Render Environment Variables Based on Your URL

## 🎯 Your Render Service URL

```
https://digichess.onrender.com
```

## ✅ Environment Variables to Set

### 1. **DJANGO_ALLOWED_HOSTS**

```
digichess.onrender.com
```

Or if you want to allow multiple:

```
digichess.onrender.com,*.onrender.com
```

**In Render Settings → Environment Variables:**
```
DJANGO_ALLOWED_HOSTS=digichess.onrender.com
```

### 2. **API_BASE_URL**

```
https://digichess.onrender.com
```

**In Render Settings → Environment Variables:**
```
API_BASE_URL=https://digichess.onrender.com
```

### 3. **REDIS_URL**

This depends on your Redis service. You need to:

1. **Go to your Render Dashboard**
2. **Find your Redis service** (or create one)
3. **Click on the Redis service**
4. **Copy the "Internal Redis URL"** (for services in same region)
   - Format: `redis://red-xxxxx:6379` or similar
5. **Or use "Redis URL"** if provided

**Common formats:**
```
redis://red-xxxxx.onrender.com:6379
```
or
```
redis://red-xxxxx:6379
```

## 📋 Complete Environment Variables List

Based on your URL `https://digichess.onrender.com`:

```bash
# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=digichess.onrender.com

# Database (from your Render PostgreSQL)
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_HOST=your-postgres-host.onrender.com
DB_PORT=5432

# Redis (from your Render Redis service)
REDIS_URL=redis://your-redis-host.onrender.com:6379/0
# OR if internal: redis://red-xxxxx:6379/0

# Frontend/API URLs
FRONTEND_URL=https://your-frontend-url.onrender.com
API_BASE_URL=https://digichess.onrender.com

# CORS & CSRF
CORS_ALLOWED_ORIGINS=https://your-frontend-url.onrender.com
CSRF_TRUSTED_ORIGINS=https://your-frontend-url.onrender.com

# Chess Engines (for Docker - already set in Dockerfile)
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models

# Email (your SendGrid config)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=465
EMAIL_USE_SSL=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=your-sendgrid-api-key
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
```

## 🔍 How to Get Redis URL

### If You Have Redis Service on Render:

1. Go to Render Dashboard
2. Click on your **Redis service**
3. Look for:
   - **"Internal Redis URL"** (use this for same region)
   - **"Redis URL"** (external access)
4. Copy the URL

### If You Need to Create Redis:

1. Render Dashboard → **"New +"** → **"Redis"**
2. Name: `digichess-redis`
3. Region: Same as your backend
4. Copy the URL it provides

## ⚠️ Important Notes

- **DJANGO_ALLOWED_HOSTS**: Only the domain, no `https://`
- **API_BASE_URL**: Full URL with `https://`
- **REDIS_URL**: Get from your Redis service dashboard
- **DB_HOST**: Get from your PostgreSQL service dashboard

## 🎯 Quick Copy-Paste (Based on Your URL)

```bash
DJANGO_ALLOWED_HOSTS=digichess.onrender.com
API_BASE_URL=https://digichess.onrender.com
REDIS_URL=redis://your-redis-service-url:6379/0
```

Replace `your-redis-service-url` with your actual Redis service URL from Render!

