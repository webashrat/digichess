# Render Setup Steps - What to Edit

## 🔍 Current Settings You Showed

✅ **Repository**: `https://github.com/webashrat/digichess` - Correct!
✅ **Branch**: `main` - Correct!
⚠️ **Root Directory**: (Optional) - **NEEDS TO BE SET**

## 🎯 What to Edit

### Step 1: Set Root Directory

In the **"Root Directory"** field (which you can see), enter:

```
digichess-backend
```

This tells Render to:
- Build from the `digichess-backend/` folder
- Look for Dockerfile there
- Only trigger deploys when files in that directory change

### Step 2: Change Runtime to Docker

Look for **"Runtime"** field (might be below or in Advanced settings):

1. Click **"Edit"** or find the Runtime dropdown
2. Change from **"Python 3"** (or whatever it is) to **"Docker"**
3. This is the MOST IMPORTANT setting!

### Step 3: Set Dockerfile Path (if visible)

If you see **"Dockerfile Path"** field:

```
Dockerfile
```

(Since Root Directory is `digichess-backend`, the path is relative: just `Dockerfile`)

## 📋 Complete Configuration

After editing, your settings should be:

```
Repository: https://github.com/webashrat/digichess
Branch: main
Root Directory: digichess-backend
Runtime: Docker
Dockerfile Path: Dockerfile (or auto-detected)
```

## 🔍 Where to Find Runtime Setting

The **Runtime** field might be:
- In the same "Build & Deploy" section
- Below the Root Directory field
- In an "Advanced" or "Show More" section
- Or you might need to scroll down

Look for a dropdown that says:
- "Runtime"
- "Environment" 
- "Build Environment"
- Or similar

It should have options like:
- Python 3
- Docker
- Node
- etc.

## ⚠️ Critical: Change Runtime to Docker

If you can't find "Runtime" field:
1. Look for "Edit" buttons near each setting
2. Check if there's a "Show Advanced" or "More Options" button
3. The Runtime might only appear after you set Root Directory first

## ✅ After Making Changes

1. Click **"Save Changes"**
2. Render will automatically rebuild using Docker
3. Check **"Logs"** tab - you should see Docker build logs

## 🆘 If You Still Can't Find "Runtime"

1. Try setting **Root Directory** first: `digichess-backend`
2. Save changes
3. Refresh the page
4. Runtime option might appear after Root Directory is set

## 💡 Quick Checklist

- [ ] Set Root Directory: `digichess-backend`
- [ ] Change Runtime: `Docker`
- [ ] Set Dockerfile Path: `Dockerfile` (if visible)
- [ ] Save Changes
- [ ] Check Logs to verify Docker build

