# Render Configuration Quick Reference

## ✅ Configuration Recommendations

### 1. **Health Check Path** ✅ **SET THIS**
   ```
   /healthz
   ```
   - Checks database connectivity
   - Returns 200 if healthy, 500 if unhealthy
   - Render will ping this periodically

### 2. **Pre-Deploy Command** ⚠️ **LEAVE EMPTY**
   ```
   (empty - nothing needed)
   ```
   - Your `docker-entrypoint.sh` already handles migrations
   - Better than Pre-Deploy because it runs on every container start

### 3. **Auto-Deploy** ✅ **KEEP ENABLED**
   - Leave default: **"On Commit"**
   - Automatically deploys when you push code

### 4. **Secret Files** ❌ **DON'T USE**
   - Use **Environment Variables** instead (already configured)
   - More secure and easier to manage
   - Secret Files are better for native deployments, not Docker

### 5. **Build Filters** ✅ **OPTIONAL - Recommended**

   **Ignored Paths** (paths that won't trigger rebuilds):
   ```
   **/*.md
   README.md
   .gitignore
   docs/**
   *.log
   ```

   This prevents unnecessary rebuilds when you only update documentation.

   **Included Paths:**
   - Leave empty (default) - rebuilds on any change
   - Or specify `digichess-backend/**` to only rebuild on backend changes

## Summary Table

| Setting | Recommendation | Value |
|---------|---------------|-------|
| Health Check Path | ✅ Set | `/healthz` |
| Pre-Deploy Command | ⚠️ Leave empty | *(nothing)* |
| Auto-Deploy | ✅ Keep enabled | On Commit |
| Secret Files | ❌ Don't use | Use Environment Variables |
| Build Filters (Ignored) | ✅ Optional | `**/*.md`, `README.md` |
| Build Filters (Included) | ✅ Optional | Leave empty or `digichess-backend/**` |

## Health Check Endpoints

Your app includes two health check endpoints:

1. **`/healthz`** - Use this for Render health checks
   - Status 200 = Healthy
   - Status 500 = Unhealthy

2. **`/readyz`** - Optional readiness check
   - Status 200 = Ready
   - Status 503 = Not Ready

Both are unauthenticated and safe for monitoring.

## What You Need to Do

1. ✅ Set **Health Check Path** to `/healthz`
2. ✅ Leave **Pre-Deploy Command** empty
3. ✅ Keep **Auto-Deploy** enabled (default)
4. ✅ Don't add any **Secret Files**
5. ✅ Optionally add **Build Filters** to ignore docs

That's it! Everything else is handled automatically by your Docker setup.

