# NPM Authentication Fix

## Problem

The frontend build was failing with:
```
npm error code E401
npm error Incorrect or missing password.
```

## Root Cause

The `package-lock.json` file contains **185 references** to a private npm registry:
- `https://sparkcognition.jfrog.io/sparkcognition/api/npm/npm/...`

This private registry requires authentication, which is not available in GitHub Actions.

## Solution

In the CI workflow, we now:
1. **Remove `package-lock.json`** before installation (it has private registry references)
2. **Set npm registry to public** (`https://registry.npmjs.org/`)
3. **Regenerate lock file** from `package.json` (which only has public packages)

This ensures npm install works without authentication.

## Changes Made

Updated `.github/workflows/ci.yml`:
- Remove package-lock.json before npm install
- Set npm registry to public
- Use `npm install --no-audit --legacy-peer-deps`

## Why This Works

- `package.json` only references public npm packages
- Removing `package-lock.json` forces npm to regenerate it from `package.json`
- The new lock file will use the public npm registry only
- No authentication required ✅

## Note

If you need to update `package-lock.json` locally, you can:
1. Remove the private registry references
2. Or regenerate it: `rm package-lock.json && npm install`

