# Can't See Runtime Field? Here's What to Do

## 🔍 The Problem

If you can't see the "Runtime" field, it's likely because:
- Runtime can only be set when **creating** a new service
- Once created, Runtime is locked and can't be changed
- You may need to create a new service with Docker

## ✅ Solution 1: Create a New Docker Service (Recommended)

Since Runtime can't be changed after creation, create a new service:

### Steps:

1. **Create New Service**
   - Go to Render Dashboard
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository: `https://github.com/webashrat/digichess`

2. **During Setup, Configure for Docker:**
   - **Name**: `digichess-backend` (or `digichess-backend-docker`)
   - **Region**: Choose your region
   - **Branch**: `main`
   - **Root Directory**: `digichess-backend` ⚠️ **Set this!**
   - **Runtime**: **"Docker"** ⚠️ **Select Docker here!**
   - **Dockerfile Path**: `Dockerfile` (auto-detected if Root Directory is set)

3. **Set Environment Variables**
   - Copy all environment variables from your old service
   - Add them to the new service

4. **Set Other Settings:**
   - Health Check Path: `/healthz`
   - Pre-Deploy Command: (leave empty)
   - Auto-Deploy: Enabled

5. **Test the New Service**
   - Wait for build to complete
   - Check logs - should see Docker build logs
   - Test health endpoint

6. **Delete Old Service** (after new one works)
   - Go to old service → Settings → "Delete Service"

## ✅ Solution 2: Check if Runtime is Hidden

Try these:

1. **Scroll Down**
   - Runtime might be below other fields

2. **Look for "Advanced" or "Show More"**
   - Click to expand more options

3. **Check "Environment" Section**
   - Runtime might be in a different section

4. **Check Service Type**
   - Make sure you're editing a "Web Service", not "Background Worker"

## ✅ Solution 3: Use Dockerfile Path Only

If you can only set Dockerfile Path (no Runtime field):

1. **Set Root Directory**: `digichess-backend`
2. **Set Dockerfile Path**: `digichess-backend/Dockerfile` (full path)
3. Render might auto-detect Docker from the Dockerfile

## 🎯 Recommended: Create New Service

The cleanest solution is to create a new service with Docker from the start:

1. **New Service** → Connect GitHub repo
2. **Set Root Directory**: `digichess-backend`
3. **Select Runtime**: `Docker` ⚠️ **Do this at creation time!**
4. **Copy environment variables** from old service
5. **Delete old service** after new one works

## ⚠️ Important Notes

- **Runtime cannot be changed** after service creation
- If your service was created as "Python 3", you need a new service
- Docker services are better for your use case (Stockfish, lc0)

## 📋 Quick Checklist for New Service

When creating new service:

- [ ] Repository: `https://github.com/webashrat/digichess`
- [ ] Branch: `main`
- [ ] **Root Directory**: `digichess-backend` ⚠️
- [ ] **Runtime**: **Docker** ⚠️ (select during creation!)
- [ ] Dockerfile Path: `Dockerfile` (or auto-detected)
- [ ] Copy all environment variables from old service
- [ ] Health Check Path: `/healthz`

