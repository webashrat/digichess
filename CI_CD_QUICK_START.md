# CI/CD Pipeline - Quick Start

## 🚀 What's Included

### 1. **CI Pipeline** (`.github/workflows/ci.yml`)
- ✅ Runs on every push/PR
- ✅ Tests backend (linting, Django checks)
- ✅ Tests frontend (build verification)
- ✅ Tests Docker builds
- ✅ Security scanning

### 2. **Deployment Pipeline** (`.github/workflows/deploy.yml`)
- ✅ Manual deployment to dev/staging/prod
- ✅ Auto-deploy to dev on push to `develop`
- ✅ Builds and pushes Docker images
- ✅ Deploys via SSH

### 3. **Docker Cache Optimization** (`.github/workflows/docker-build-cache.yml`)
- ✅ Weekly cache warming
- ✅ Faster CI builds

## 📋 Quick Setup

### Step 1: Verify CI is Working

Just push code - CI runs automatically! Check status:
```
https://github.com/webashrat/digichess/actions
```

### Step 2: Set Up Deployment (Optional)

**Add GitHub Secrets:**

1. Go to: Repository → Settings → Secrets → Actions
2. Add these secrets for each environment:

**Development:**
- `DEV_HOST` - Server hostname/IP
- `DEV_USER` - SSH username  
- `DEV_SSH_KEY` - SSH private key
- `DEV_ENVIRONMENT_URL` - Your dev URL

**Staging:**
- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_SSH_KEY`
- `STAGING_ENVIRONMENT_URL`

**Production:**
- `PRODUCTION_HOST`
- `PRODUCTION_USER`
- `PRODUCTION_SSH_KEY`
- `PRODUCTION_ENVIRONMENT_URL`

### Step 3: Generate SSH Key

```bash
# Generate key pair
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server

# Add private key to GitHub Secrets (copy contents of ~/.ssh/github_actions_deploy)
```

### Step 4: Set Up Server

```bash
# On your server
cd /opt/digichess
git clone https://github.com/webashrat/digichess.git .
cd digichess-backend
cp env.example .env
# Edit .env with your values
docker compose up -d
```

## 🎯 Usage

### Automatic CI
- Push code → CI runs automatically
- Check status in Actions tab

### Manual Deployment

1. Go to **Actions** tab
2. Select **Deploy to Development**
3. Click **Run workflow**
4. Select environment
5. Click **Run workflow**

### Auto Deploy to Dev
- Push to `develop` branch → Auto-deploys to development

## 📊 Workflow Status

Add this badge to your README:

```markdown
![CI/CD Pipeline](https://github.com/webashrat/digichess/workflows/CI/CD%20Pipeline/badge.svg)
```

## 🔧 Files Created

- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/deploy.yml` - Deployment pipeline
- `.github/workflows/docker-build-cache.yml` - Cache optimization
- `.github/README.md` - Detailed documentation
- `CICD_SETUP.md` - Complete setup guide
- `digichess-backend/docker-compose.prod.yml` - Production config

## ⚡ Next Steps

1. ✅ Push code to trigger CI
2. 🔄 Configure GitHub Secrets (for deployment)
3. 🔄 Set up deployment server
4. 🔄 Test deployment

See `CICD_SETUP.md` for detailed instructions!

