# Render Configuration - When Dockerfile Field Disappears

## ✅ That's CORRECT!

When you set **Root Directory** to `digichess-backend`, the **Dockerfile Path** field disappears. This is **expected behavior**!

## 🎯 How It Works

### When Root Directory is Set:

1. **Root Directory**: `digichess-backend`
   - Render uses `digichess-backend/` as the build context
   - All paths become relative to this directory

2. **Dockerfile Path Field Disappears**
   - This is **NORMAL**!
   - Render automatically looks for `Dockerfile` in the root directory
   - Since your Dockerfile is at `digichess-backend/Dockerfile` (from repo root)
   - Render will find it as `Dockerfile` (relative to the root directory)

## ✅ Correct Configuration

```
Root Directory: digichess-backend
Dockerfile Path: (field disappears - that's OK!)
Runtime: Docker
```

## 📋 Final Settings Checklist

When creating/editing your service:

- [x] **Root Directory**: `digichess-backend` ✅
- [x] **Dockerfile Path**: (field disappears when Root Directory is set) ✅
- [x] **Runtime**: `Docker` ✅ (set during service creation)
- [ ] **Environment Variables**: Copy from old service
- [ ] **Health Check Path**: `/healthz`
- [ ] **Pre-Deploy Command**: (leave empty)

## ✅ You're All Set!

When the Dockerfile Path field disappears after setting Root Directory, it means:
- ✅ Render will automatically find `Dockerfile` in `digichess-backend/`
- ✅ Build context is set correctly
- ✅ Everything should work!

## 🚀 Next Steps

1. **Make sure Runtime is set to Docker** (during service creation)
2. **Set Root Directory**: `digichess-backend` ✅ (you did this!)
3. **Save Changes**
4. **Check Logs** - should see Docker build starting

The disappearing Dockerfile Path field is a feature, not a bug! 🎉

