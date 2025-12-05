# CI/CD Pipeline Setup Guide

## Overview

This project uses GitHub Actions for Continuous Integration and Continuous Deployment. The pipeline includes:

- ✅ Automated testing and linting
- ✅ Docker image building and caching
- ✅ Security vulnerability scanning
- ✅ Automated deployment to multiple environments

## Quick Start

### 1. Verify Workflows are Working

After pushing code, check the Actions tab:
- Go to: https://github.com/webashrat/digichess/actions
- You should see workflows running automatically

### 2. Set Up Deployment (Optional)

If you want automated deployment, configure GitHub Secrets:

1. Go to: Repository Settings → Secrets and variables → Actions
2. Add the required secrets (see below)

## Workflow Details

### CI Pipeline (`ci.yml`)

**Runs on:**
- Every push to `main` or `develop`
- Every pull request
- Manual trigger

**Checks:**
1. **Backend**: Code formatting, linting, Django checks
2. **Frontend**: TypeScript linting, build verification
3. **Docker**: Image build test
4. **Security**: Dependency vulnerability scan

### Deployment Pipeline (`deploy.yml`)

**Manual deployment:**
1. Go to Actions → Deploy to Development
2. Click "Run workflow"
3. Select environment: development/staging/production
4. Click "Run workflow"

**Automatic deployment:**
- Pushes to `develop` → Auto-deploy to development

## Required GitHub Secrets

### For Development Deployment

```bash
DEV_HOST=your-dev-server.com
DEV_USER=deploy
DEV_SSH_KEY=<private-ssh-key>
DEV_ENVIRONMENT_URL=https://dev.yourdomain.com
```

### For Staging Deployment

```bash
STAGING_HOST=staging-server.com
STAGING_USER=deploy
STAGING_SSH_KEY=<private-ssh-key>
STAGING_ENVIRONMENT_URL=https://staging.yourdomain.com
```

### For Production Deployment

```bash
PRODUCTION_HOST=production-server.com
PRODUCTION_USER=deploy
PRODUCTION_SSH_KEY=<private-ssh-key>
PRODUCTION_ENVIRONMENT_URL=https://yourdomain.com
```

## Setting Up SSH Keys

### Step 1: Generate SSH Key Pair

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_deploy
```

This creates:
- `~/.ssh/github_actions_deploy` (private key - add to GitHub Secrets)
- `~/.ssh/github_actions_deploy.pub` (public key - add to server)

### Step 2: Add Public Key to Server

```bash
# Copy public key to server
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server

# Or manually add to ~/.ssh/authorized_keys on server
cat ~/.ssh/github_actions_deploy.pub | ssh user@your-server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### Step 3: Add Private Key to GitHub Secrets

1. Copy private key:
   ```bash
   cat ~/.ssh/github_actions_deploy
   ```

2. Go to GitHub → Repository → Settings → Secrets → Actions
3. Click "New repository secret"
4. Name: `DEV_SSH_KEY`
5. Value: Paste the private key content
6. Click "Add secret"

## Server Setup

### Initial Server Configuration

```bash
# SSH into your server
ssh user@your-server

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for Docker group to take effect
exit
ssh user@your-server

# Create application directory
sudo mkdir -p /opt/digichess
sudo chown $USER:$USER /opt/digichess
cd /opt/digichess

# Clone repository
git clone https://github.com/webashrat/digichess.git .
cd digichess-backend

# Create .env file from template
cp env.example .env
nano .env  # Edit with production values

# Start services
docker compose up -d
```

### Production Environment Variables

Your `.env` file should include:

```bash
# Django
DJANGO_SECRET_KEY=<generate-secure-key>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Database
DB_NAME=digichess_prod
DB_USER=digichess_user
DB_PASSWORD=<secure-password>
DB_HOST=postgres
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# Chess Engines (already correct for Docker)
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
MAIA_MODELS_DIR=/app/games/maia_models

# Email (SendGrid)
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=465
EMAIL_USE_SSL=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=<your-sendgrid-api-key>
DEFAULT_FROM_EMAIL=noreply@yourdomain.com

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Frontend
FRONTEND_URL=https://yourdomain.com
API_BASE_URL=https://api.yourdomain.com
```

### Production Docker Compose

For production, use both compose files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This enables:
- Production logging configuration
- Health checks
- Restart policies
- Removed port mappings (internal only)

## Deployment Process

### Automatic Deployment (Development)

1. Make changes to code
2. Push to `develop` branch:
   ```bash
   git checkout develop
   git add .
   git commit -m "Your changes"
   git push origin develop
   ```
3. GitHub Actions automatically:
   - Builds Docker images
   - Pushes to GitHub Container Registry
   - Deploys to development server

### Manual Deployment

1. Go to GitHub Actions: https://github.com/webashrat/digichess/actions
2. Select "Deploy to Development" workflow
3. Click "Run workflow"
4. Select:
   - Branch: `main` or `develop`
   - Environment: `development`, `staging`, or `production`
5. Click "Run workflow"

## Monitoring Deployments

### Check Workflow Status

- Go to: https://github.com/webashrat/digichess/actions
- Click on a workflow run to see detailed logs

### Check Server Status

After deployment, verify services:

```bash
# SSH into server
ssh user@your-server

# Check Docker containers
cd /opt/digichess/digichess-backend
docker compose ps

# Check logs
docker compose logs -f backend

# Check if backend is responding
curl http://localhost:8000/api/games/public/
```

## Troubleshooting

### CI Pipeline Fails

**Backend tests fail:**
- Check Python syntax errors
- Verify all dependencies in `requirements.txt`
- Run `python manage.py check` locally

**Frontend build fails:**
- Check TypeScript errors
- Verify npm dependencies
- Run `npm run build` locally

**Docker build fails:**
- Check Dockerfile syntax
- Verify Stockfish source exists
- Check build logs for specific errors

### Deployment Fails

**SSH connection fails:**
- Verify SSH key in GitHub Secrets
- Check server is accessible
- Test SSH connection manually

**Deployment script fails:**
- Check server has Docker Compose installed
- Verify `.env` file exists
- Check Docker Compose file paths

**Services don't start:**
- Check logs: `docker compose logs`
- Verify environment variables
- Check port conflicts

## Best Practices

1. ✅ **Test locally first** - Run tests before pushing
2. ✅ **Review CI results** - Wait for CI to pass before merging
3. ✅ **Deploy to staging** - Test in staging before production
4. ✅ **Monitor deployments** - Watch logs after deployment
5. ✅ **Use environment variables** - Never commit secrets
6. ✅ **Keep backups** - Backup database before major deployments
7. ✅ **Use tags/releases** - Tag releases for production deployments

## Next Steps

1. ✅ Set up GitHub Secrets for deployment
2. ✅ Configure deployment server
3. ✅ Test deployment to development
4. ✅ Set up staging environment
5. ✅ Configure production environment
6. ✅ Set up monitoring and alerts

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Django Deployment Checklist](https://docs.djangoproject.com/en/stable/howto/deployment/checklist/)

