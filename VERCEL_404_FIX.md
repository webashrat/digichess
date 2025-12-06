# Fixing 404 Error on Vercel - API Not Found

## Problem

You're getting:
```
GET https://digichess.vercel.app/games/1 404 (Not Found)
```

This means the frontend is trying to fetch from the frontend domain instead of the backend.

## Root Cause

The API client's `baseURL` is likely empty or undefined, causing requests to go to the frontend domain instead of the backend.

## Solution

### 1. Verify Environment Variables in Vercel

Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**

Make sure you have:
- ✅ `VITE_API_BASE_URL` = `https://digichess.onrender.com` (NO trailing slash)
- ✅ `VITE_WS_BASE_URL` = `wss://digichess.onrender.com` (NO trailing slash)

**Important**: 
- These must be set for **All Environments** (Production, Preview, Development)
- After adding/changing env vars, you **MUST redeploy** for them to take effect!

### 2. Redeploy Your Frontend

After setting environment variables:
1. Go to **Vercel Dashboard → Your Project → Deployments**
2. Click the **"..."** menu on the latest deployment
3. Click **"Redeploy"**
4. OR push a new commit to trigger a new build

**Why?** Vite environment variables are embedded at **BUILD TIME**. If they're not set during the build, they won't be in the bundle!

### 3. Verify in Browser Console

After redeploying, open your app and check the browser console (F12). You should see:
```
API Base URL: https://digichess.onrender.com
Environment VITE_API_BASE_URL: https://digichess.onrender.com
```

If you see:
```
API Base URL: http://localhost:8000
Environment VITE_API_BASE_URL: undefined
```

Then the environment variable is NOT being read. This means:
- It wasn't set during build time
- OR you need to redeploy

### 4. Check Backend CORS Settings

In **Render Dashboard → Your Service → Environment**, make sure:

```bash
CORS_ALLOWED_ORIGINS=https://digichess.vercel.app
CSRF_TRUSTED_ORIGINS=https://digichess.vercel.app
```

**Important**: NO trailing slashes!

### 5. Test Direct API Call

Test the backend API directly:

```bash
curl https://digichess.onrender.com/api/games/1/
```

If this works, the backend is fine. The issue is the frontend configuration.

## Debugging Steps

1. **Check Browser Console**:
   - Open DevTools (F12) → Console tab
   - Look for the debug logs showing API Base URL
   - Look for any API error messages

2. **Check Network Tab**:
   - Open DevTools (F12) → Network tab
   - Navigate to `/games/1`
   - Look for the API request
   - Check the request URL - it should be `https://digichess.onrender.com/api/games/1/`
   - If it's `https://digichess.vercel.app/games/1`, the baseURL is wrong

3. **Check Vercel Build Logs**:
   - Go to Vercel Dashboard → Your Project → Deployments
   - Click on a deployment
   - Check the build logs
   - Look for any errors or warnings about environment variables

## Expected Behavior

When you navigate to `https://digichess.vercel.app/games/1`:

1. ✅ React Router handles the route `/games/1`
2. ✅ GameView component loads
3. ✅ Component calls `fetchGameDetail(1)`
4. ✅ API client makes request to `https://digichess.onrender.com/api/games/1/`
5. ✅ Backend responds with game data

## Quick Fix Checklist

- [ ] Environment variables set in Vercel (All Environments)
- [ ] Redeployed frontend after setting env vars
- [ ] Verified API Base URL in browser console
- [ ] Checked Network tab for correct API URL
- [ ] Backend CORS allows frontend domain
- [ ] Backend is accessible at `https://digichess.onrender.com`

## Still Not Working?

If it's still not working after redeploying:

1. **Check the actual request in Network tab**:
   - What URL is being called?
   - What's the response status?
   - What's the error message?

2. **Clear browser cache**:
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Or clear cache in DevTools

3. **Check if it's an authentication issue**:
   - Are you logged in?
   - Is the token being sent?
   - Check the Authorization header in Network tab

4. **Verify backend is running**:
   - Check Render dashboard
   - Test `/healthz/` endpoint: `curl https://digichess.onrender.com/healthz/`

## Files Changed

- `src/api/client.ts` - Added debug logging and better error handling
- `vercel.json` - Added routing configuration for SPA

After fixing, commit and push these changes, then redeploy!

