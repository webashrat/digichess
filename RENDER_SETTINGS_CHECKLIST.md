# Render Settings Checklist - What to Fill

## ✅ Settings Configuration

### 1. **Health Check Path** ✅
```
/healthz
```
**Status:** Already set correctly! ✅

### 2. **Registry Credential**
```
No credential
```
**Status:** Leave as is (you're not using private Docker images) ✅

### 3. **Docker Build Context Directory** ⚠️
```
digichess-backend/
```
**Action:** Select `digichess-backend/`
- This sets the build context to the backend directory
- Render will build from there

### 4. **Dockerfile Path** ⚠️
```
Dockerfile
```
**Action:** Since Build Context is `digichess-backend/`, Dockerfile Path should be:
- Just `Dockerfile` (relative to build context)
- OR if it wants full path: `digichess-backend/Dockerfile`

Try: `Dockerfile` first (relative to the build context)

### 5. **Docker Command**
```
(leave EMPTY)
```
**Action:** Leave empty
- Your Dockerfile already has CMD defined
- Don't override it

### 6. **Pre-Deploy Command** ⚠️ **IMPORTANT**
```
(leave EMPTY)
```
**Action:** **CLEAR THIS FIELD!** 
- Currently shows: `digichess-backend/ $` 
- This should be **EMPTY**
- Your `docker-entrypoint.sh` handles migrations automatically

### 7. **Auto-Deploy**
```
On Commit
```
**Status:** Already set correctly! ✅

## 📋 Final Configuration Summary

```
Health Check Path: /healthz ✅
Registry Credential: No credential ✅
Docker Build Context Directory: digichess-backend/ ⚠️ SET THIS
Dockerfile Path: Dockerfile ⚠️ SET THIS
Docker Command: (empty) ✅
Pre-Deploy Command: (empty) ⚠️ CLEAR THIS!
Auto-Deploy: On Commit ✅
```

## 🎯 Key Changes Needed

1. ✅ **Docker Build Context Directory**: Set to `digichess-backend/`
2. ✅ **Dockerfile Path**: Set to `Dockerfile` (or try `digichess-backend/Dockerfile` if that doesn't work)
3. ⚠️ **Pre-Deploy Command**: **DELETE/EMPTY** - remove `digichess-backend/ $`
4. ✅ Everything else looks good!

## ⚠️ Critical: Clear Pre-Deploy Command

**Currently shows:** `digichess-backend/ $`

**Should be:** (empty/nothing)

Your `docker-entrypoint.sh` already handles:
- Database migrations
- Static files
- Bot creation

Pre-Deploy Command is NOT needed and will cause conflicts!

