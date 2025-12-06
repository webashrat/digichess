# How to Add/Edit Environment Variables in Render

## 🎯 Step-by-Step Guide

### Method 1: From Service Settings (Recommended)

1. **Go to Your Service**
   - Render Dashboard → Click on your service (e.g., "digichess-backend")

2. **Open Environment Section**
   - Click **"Environment"** tab at the top
   - Or scroll to **"Environment Variables"** section in Settings

3. **Add New Variable**
   - Click **"Add Environment Variable"** button
   - Enter:
     - **Key**: `DJANGO_ALLOWED_HOSTS` (variable name)
     - **Value**: `digichess.onrender.com` (the value)
   - Click **"Save Changes"** or **"Add"**

4. **Edit Existing Variable**
   - Find the variable in the list
   - Click **"Edit"** or the pencil icon
   - Change the value
   - Click **"Save Changes"**

5. **Delete Variable**
   - Find the variable
   - Click **"Delete"** or trash icon
   - Confirm deletion

### Method 2: From Settings Tab

1. **Go to Settings**
   - Your Service → **"Settings"** tab

2. **Find Environment Section**
   - Scroll to **"Environment Variables"** section

3. **Add/Edit Variables**
   - Same as Method 1 above

## 📋 Quick Steps Visual Guide

```
1. Dashboard → Your Service
2. Click "Environment" tab (or "Settings" → scroll to Environment)
3. Click "Add Environment Variable"
4. Enter:
   Key: DJANGO_ALLOWED_HOSTS
   Value: digichess.onrender.com
5. Click "Save Changes"
```

## ✅ Adding Multiple Variables

You can add them one by one:

1. **First Variable:**
   - Key: `DJANGO_ALLOWED_HOSTS`
   - Value: `digichess.onrender.com`
   - Save

2. **Second Variable:**
   - Key: `API_BASE_URL`
   - Value: `https://digichess.onrender.com`
   - Save

3. **Third Variable:**
   - Key: `REDIS_URL`
   - Value: `redis://your-redis-url:6379/0`
   - Save

Continue for all variables you need!

## 🎯 Variables to Add Based on Your URL

Add these variables one by one:

```bash
DJANGO_ALLOWED_HOSTS = digichess.onrender.com
API_BASE_URL = https://digichess.onrender.com
REDIS_URL = redis://your-redis-service:6379/0
```

(Replace `your-redis-service` with actual Redis URL)

## 💡 Pro Tips

- **No quotes needed** - Just enter the value directly
- **Case sensitive** - Use exact variable names
- **Save after each** - Or add all, then save once
- **Check for typos** - Variable names must match your code exactly

## 🔄 After Adding Variables

1. **Service will auto-restart** (if running)
2. **Or manually restart**: Settings → "Restart Service"
3. **Check Logs** to verify variables are loaded

## 🆘 Can't Find Environment Section?

- Look for **"Environment"** tab at the top
- Or in **"Settings"** tab, scroll down
- Might be under **"Build & Deploy"** → "Environment"

