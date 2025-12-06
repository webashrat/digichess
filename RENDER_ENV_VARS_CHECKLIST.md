# Render Environment Variables Checklist

## ✅ Your Current Environment Variables (All Present!)

### Core Django Settings (Required)
- ✅ `DJANGO_SECRET_KEY` - Required for security
- ✅ `DJANGO_DEBUG` - Should be `False` in production
- ✅ `DJANGO_ALLOWED_HOSTS` - Your Render domain(s)

### Database (Required)
- ✅ `DB_NAME` - PostgreSQL database name
- ✅ `DB_USER` - PostgreSQL user
- ✅ `DB_PASSWORD` - PostgreSQL password
- ✅ `DB_HOST` - PostgreSQL host (from Render)
- ✅ `DB_PORT` - PostgreSQL port (usually `5432`)

### Redis (Required for Celery & WebSockets)
- ✅ `REDIS_URL` - Redis connection URL (from Render)

### Frontend/API URLs (Required)
- ✅ `API_BASE_URL` - Your Render backend URL (e.g., `https://digichess.onrender.com`)
- ✅ `FRONTEND_URL` - Your Vercel frontend URL (e.g., `https://digichess.vercel.app`)
- ✅ `CORS_ALLOWED_ORIGINS` - Same as FRONTEND_URL (no trailing slash)
- ✅ `CSRF_TRUSTED_ORIGINS` - Same as FRONTEND_URL (no trailing slash)

### Chess Engines (Optional but Recommended)
- ✅ `STOCKFISH_PATH` - Path to Stockfish binary (default: `/usr/local/bin/stockfish`)
- ✅ `LC0_PATH` - Path to lc0 binary for Maia (auto-detected if not set)
- ✅ `MAIA_MODELS_DIR` - Directory for Maia models (default: `/app/games/maia_models`)

### Lichess API (Optional but Recommended for Performance)
- ✅ `LICHESS_API_TOKEN` - Your Lichess personal access token for faster API calls

### Email Configuration (Optional - for email notifications)
- ✅ `EMAIL_BACKEND` - Email backend (e.g., `django.core.mail.backends.smtp.EmailBackend`)
- ✅ `EMAIL_HOST` - SMTP server host
- ✅ `EMAIL_PORT` - SMTP port (usually `587` or `465`)
- ✅ `EMAIL_USE_TLS` - Use TLS (usually `True`)
- ✅ `EMAIL_HOST_USER` - SMTP username
- ✅ `EMAIL_HOST_PASSWORD` - SMTP password
- ✅ `DEFAULT_FROM_EMAIL` - From email address
- ✅ `SERVER_EMAIL` - Server email address
- ✅ `EMAIL_USE_SSL` - ⚠️ Not used in code (only `EMAIL_USE_TLS` is used), but harmless to have

### SendGrid (Optional - if using SendGrid for email)
- ✅ `SENDGRID_API_KEY` - SendGrid API key (auto-detected if available)

### Other (Has Defaults - Optional)
- `OTP_EXPIRY_MINUTES` - Defaults to `10` if not set

## ✅ Status: ALL REQUIRED VARIABLES ARE SET!

Your configuration is complete. All critical environment variables are present.

## Optional Improvements

### 1. Remove Unused Variables (Optional)
- `EMAIL_USE_SSL` - Not used in code (only `EMAIL_USE_TLS` is checked). You can remove it if you want.

### 2. Verify Values (Important)
Make sure these have the correct values for production:

- `DJANGO_DEBUG` should be `False`
- `DJANGO_ALLOWED_HOSTS` should include your Render domain (e.g., `digichess.onrender.com`)
- `API_BASE_URL` should be `https://digichess.onrender.com` (no trailing slash)
- `FRONTEND_URL` should be your Vercel URL (e.g., `https://digichess.vercel.app` or `https://digichess.play.app`)
- `CORS_ALLOWED_ORIGINS` should match `FRONTEND_URL` (no trailing slash, comma-separated if multiple)
- `CSRF_TRUSTED_ORIGINS` should match `CORS_ALLOWED_ORIGINS`

### 3. Security Checklist
- ✅ `DJANGO_SECRET_KEY` is set (never use defaults in production)
- ✅ `DJANGO_DEBUG` is `False` in production
- ✅ `DB_PASSWORD` is secure
- ✅ All API keys/tokens are set

## Summary

🎉 **Your environment variables are complete!** Everything needed is present. The setup looks good for production deployment on Render.

