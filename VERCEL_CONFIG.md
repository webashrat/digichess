# Vercel Frontend Deployment Configuration

## ✅ Your Current Configuration (CORRECT!)

```
Framework Preset: Vite ✅
Root Directory: ./ ✅
Build Command: npm run build ✅
Output Directory: dist ✅
Install Command: npm install ✅
Environment Variables:
  - VITE_API_BASE_URL = https://digichess.onrender.com ✅
```

## ⚠️ One Additional Variable Needed

Your frontend also uses WebSocket connections. Add this environment variable:

### Add WebSocket URL

**Key**: `VITE_WS_BASE_URL`
**Value**: `wss://digichess.onrender.com`

**Note**: Use `wss://` (secure WebSocket) since your backend uses HTTPS.

## 📋 Complete Environment Variables

Add these to Vercel:

1. **VITE_API_BASE_URL** ✅ (you already have this)
   - Value: `https://digichess.onrender.com`

2. **VITE_WS_BASE_URL** ⚠️ (add this)
   - Value: `wss://digichess.onrender.com`

## 🎯 Why WebSocket URL?

Your frontend uses WebSocket for:
- Real-time game updates
- Live chess moves
- Matchmaking notifications
- Online presence

Without `VITE_WS_BASE_URL`, WebSockets will fall back to `ws://localhost:8000` which won't work in production.

## ✅ Final Checklist

- [x] Framework Preset: Vite
- [x] Root Directory: ./
- [x] Build Command: npm run build
- [x] Output Directory: dist
- [x] Install Command: npm install
- [x] VITE_API_BASE_URL: https://digichess.onrender.com
- [ ] **VITE_WS_BASE_URL: wss://digichess.onrender.com** ⚠️ ADD THIS!

## 🔗 URL Format

- **HTTP/HTTPS API**: `https://digichess.onrender.com`
- **WebSocket**: `wss://digichess.onrender.com` (note the `wss://`)

## 💡 Quick Add

In Vercel Environment Variables:
1. Click **"+ Add More"**
2. Key: `VITE_WS_BASE_URL`
3. Value: `wss://digichess.onrender.com`
4. Save

Your configuration is almost perfect - just add the WebSocket URL! 🎉

