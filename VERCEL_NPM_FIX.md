# Fix NPM Authentication Error in Vercel

## 🔍 The Problem

Vercel is failing with:
```
npm error code E401
npm error Incorrect or missing password.
```

This is because `package-lock.json` contains references to a **private npm registry** (`sparkcognition.jfrog.io`) that requires authentication.

## ✅ Solution: Regenerate package-lock.json

### Option 1: Fix Locally and Push (Recommended)

1. **Backup current package-lock.json**
   ```bash
   cp package-lock.json package-lock.json.backup
   ```

2. **Remove package-lock.json**
   ```bash
   rm package-lock.json
   ```

3. **Set npm to use public registry**
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

4. **Regenerate package-lock.json using public packages only**
   ```bash
   npm install
   ```

5. **Commit and push**
   ```bash
   git add package-lock.json
   git commit -m "Regenerate package-lock.json using public npm registry"
   git push origin main
   ```

6. **Vercel will automatically redeploy** with the new lock file

### Option 2: Configure Vercel Build Settings

In Vercel, you can override the install command:

1. Go to your Vercel project → **Settings** → **Build & Development Settings**

2. **Override Install Command:**
   ```
   npm config set registry https://registry.npmjs.org/ && npm install
   ```

   Or:
   ```
   rm -f package-lock.json && npm config set registry https://registry.npmjs.org/ && npm install
   ```

3. Save and redeploy

## 🎯 Quick Fix Steps

### Step-by-Step:

1. **Set npm registry to public:**
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

2. **Remove old lock file:**
   ```bash
   rm package-lock.json
   ```

3. **Install with new registry:**
   ```bash
   npm install
   ```

4. **Commit changes:**
   ```bash
   git add package-lock.json
   git commit -m "Fix: Regenerate package-lock.json for Vercel deployment"
   git push origin main
   ```

## 📋 Alternative: Create .npmrc in Repository

Create `.npmrc` file in your repo root:

```
registry=https://registry.npmjs.org/
```

This will tell npm (including Vercel) to use the public registry.

## ✅ Recommended: Regenerate Lock File

The cleanest solution is to regenerate `package-lock.json` using only public packages. This ensures Vercel (and anyone else) can build your project without authentication.

