# Railway Deployment Guide

## ✅ Setup Complete

Your social media automation platform is now ready for Railway deployment with a working monorepo structure.

## 📋 What Was Done

### 1. Monorepo Structure Created
```
frontend/
├── app/                         # Next.js app
├── backend/                     # Backend (created during build)
│   ├── core/                   # Workflow orchestrator
│   ├── video/                  # Video generation modules
│   ├── image/                  # Image generation
│   ├── config/                 # Configuration
│   ├── data/                   # Campaign state files
│   └── main.js                 # CLI entry point
├── scripts/
│   └── setup-backend.sh        # Build-time backend copy script
└── railway.toml                # Railway deployment config
```

### 2. Railway Configuration (railway.toml)
- **Builder**: Nixpacks
- **Build Command**: `bash scripts/setup-backend.sh && npm ci && npm run build`
- **Start Command**: `node_modules/.bin/next start -p $PORT`
- **Restart Policy**: On failure (max 10 retries)

### 3. API Routes Updated
All three API routes now use the monorepo pattern:
- `/api/workflow/execute` - Full campaign execution with SSE streaming
- `/api/workflow/stage` - Single stage execution with LongCat support
- `/api/workflow/data` - Fetch workflow stage data

Path pattern: `path.join(process.cwd(), 'backend')`

### 4. Build Script
`scripts/setup-backend.sh` copies backend files during Railway build:
- Copies `core/`, `video/`, `image/`, `config/` from parent directory
- Copies `main.js`, `package.json`, `package-lock.json`
- Creates `data/` directory for campaign state
- The `backend/` folder is gitignored (build-time only)

### 5. Module Resolution
Added NODE_PATH configuration for backend to find dependencies:
```javascript
const parentNodeModules = path.join(process.cwd(), 'node_modules')
const nodeEnv = {
  ...process.env,
  NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '')
}
```

## 🚀 Deployment Steps

### 1. Connect to Railway
1. Go to [Railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select: `yogsbags/pl-social-media`
4. Railway will automatically detect `frontend/railway.toml`

### 2. Configure Environment Variables
Set these in Railway dashboard (Settings → Variables):

**Required for AI Generation:**
```bash
GROQ_API_KEY=<your-groq-api-key>
GEMINI_API_KEY=<your-gemini-api-key>
```

**Required for Video Generation:**
```bash
FAL_KEY=<your-fal-key>              # LongCat long-form videos
HEYGEN_API_KEY=<your-heygen-key>    # AI avatar videos
```

**Required for Image Generation:**
```bash
REPLICATE_API_TOKEN=<your-replicate-token>
```

**Optional:**
```bash
NEXT_PUBLIC_API_URL=<backend-api-url-if-needed>
```

### 3. Deploy
Railway will automatically:
1. Run `scripts/setup-backend.sh` (copies backend files)
2. Run `npm ci` (install dependencies)
3. Run `npm run build` (build Next.js)
4. Start with `next start -p $PORT`

## 🔍 Verification

### Local Testing
Already verified locally:
```bash
✅ Backend folder created successfully
✅ All modules copied (core, video, image, config)
✅ main.js executable and working
✅ Dev server running on port 3004
✅ API routes serving successfully (GET / 200)
```

### Railway Testing
After deployment, test these endpoints:

1. **Homepage**: `https://<your-app>.railway.app/`
   - Should show dashboard

2. **Workflow Data**: `https://<your-app>.railway.app/api/workflow/data?stage=1`
   - Should return campaign data or empty state

3. **Stage Execution**: `POST https://<your-app>.railway.app/api/workflow/stage`
   ```json
   {
     "stageId": 1,
     "campaignType": "linkedin-carousel",
     "topic": "AI in finance"
   }
   ```
   - Should return SSE stream with logs

## 📁 File Structure Reference

### Backend Files (Copied During Build)
```
../core/orchestrator.js          → backend/core/orchestrator.js
../core/state-manager.js         → backend/core/state-manager.js
../video/video-coordinator.js    → backend/video/video-coordinator.js
../video/video-generator.js      → backend/video/video-generator.js
../video/avatar-generator.js     → backend/video/avatar-generator.js
../video/longcat-generator.js    → backend/video/longcat-generator.js
../video/video-editor.js         → backend/video/video-editor.js
../image/image-generator.js      → backend/image/image-generator.js
../config/brand-config.js        → backend/config/brand-config.js
../config/heygen-avatar-config.js → backend/config/heygen-avatar-config.js
../config/plindia-images.json    → backend/config/plindia-images.json
../main.js                        → backend/main.js
../package.json                   → backend/package.json
```

### Frontend API Routes
```
app/api/workflow/execute/route.ts  - Full campaign workflow
app/api/workflow/stage/route.ts    - Individual stage execution
app/api/workflow/data/route.ts     - Fetch stage data
```

## 🐛 Troubleshooting

### Build Fails
**Error**: "scripts/setup-backend.sh: No such file or directory"
- **Fix**: Ensure script has execute permissions: `chmod +x scripts/setup-backend.sh`
- **Fix**: Verify script is committed to git

### Backend Not Found (502 Errors)
**Error**: "ENOENT: no such file or directory, open 'backend/main.js'"
- **Fix**: Check Railway build logs to verify setup-backend.sh ran
- **Fix**: Ensure parent directory structure exists (../ relative to frontend/)

### Module Resolution Errors
**Error**: "Cannot find module 'groq-sdk'"
- **Fix**: Verify NODE_PATH is set in environment
- **Fix**: Ensure npm ci installed all dependencies

### Stage Execution Fails
**Error**: "spawn ENOENT" when executing backend
- **Fix**: Verify main.js has correct path in API routes
- **Fix**: Check workingDir is set to backend/ subdirectory

## 📊 Expected Behavior

### Build Process
```
1. Checkout code from GitHub
2. Run: bash scripts/setup-backend.sh
   📦 Setting up backend for deployment...
   ✅ Backend setup complete!
3. Run: npm ci
   ✓ Dependencies installed
4. Run: npm run build
   ✓ Next.js built successfully
5. Start: next start -p 8080
   ✓ Ready on http://localhost:8080
```

### Runtime
```
1. User visits dashboard → GET / 200
2. User executes workflow → POST /api/workflow/stage
3. API spawns: node backend/main.js stage planning
4. Backend streams logs via SSE
5. Backend saves state to backend/data/campaign-state.json
6. Frontend receives completion status
```

## 🎯 Next Steps

1. **Deploy to Railway**: Follow deployment steps above
2. **Configure Environment Variables**: Add all API keys
3. **Test Endpoints**: Verify API routes work
4. **Execute First Campaign**: Run a test workflow
5. **Monitor Logs**: Check Railway dashboard for any issues

## 📝 Notes

- **Port**: Railway automatically assigns $PORT (usually 8080)
- **Data Persistence**: Use Railway volumes for backend/data/ if needed
- **API Keys**: Never commit API keys to git - use Railway environment variables
- **Build Time**: First build takes 2-3 minutes, subsequent builds are faster

## 🔗 Resources

- **Repository**: https://github.com/yogsbags/pl-social-media
- **Railway Docs**: https://docs.railway.app
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

**Status**: ✅ Ready for deployment
**Last Updated**: 2025-11-24
**Deployed By**: Railway.app
