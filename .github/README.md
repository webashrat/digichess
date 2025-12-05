# GitHub Actions CI/CD Pipeline

This directory contains GitHub Actions workflows for continuous integration and deployment.

## Workflows

### 1. `ci.yml` - Continuous Integration

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**Jobs:**
- **Backend Test**: Lints Python code, checks Django settings, validates migrations
- **Frontend Build**: Lints TypeScript/React, builds frontend bundle
- **Docker Build**: Tests Docker image builds
- **Security Scan**: Checks for vulnerable dependencies

**Duration:** ~5-10 minutes

### 2. `deploy.yml` - Deployment

**Triggers:**
- Manual dispatch with environment selection
- Push to `develop` branch (auto-deploy to development)

**Environments:**
- `development` - Development server
- `staging` - Staging server (manual only)
- `production` - Production server (manual only)

**Process:**
1. Builds Docker images
2. Pushes to GitHub Container Registry
3. Deploys to selected environment via SSH

### 3. `docker-build-cache.yml` - Cache Optimization

**Triggers:**
- Weekly schedule (Sundays at midnight)
- Manual dispatch

**Purpose:** Pre-builds Docker images to warm up cache for faster CI builds

## Setup Instructions

### Required GitHub Secrets

For **Development** environment:
```
DEV_HOST              # SSH hostname or IP
DEV_USER              # SSH username
DEV_SSH_KEY           # SSH private key
DEV_ENVIRONMENT_URL   # URL of dev environment (optional)
```

For **Staging** environment:
```
STAGING_HOST
STAGING_USER
STAGING_SSH_KEY
STAGING_ENVIRONMENT_URL
```

For **Production** environment:
```
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_SSH_KEY
PRODUCTION_ENVIRONMENT_URL
```

### Setting Up SSH Keys

1. Generate SSH key pair:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
   ```

2. Copy public key to server:
   ```bash
   ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server
   ```

3. Add private key to GitHub Secrets:
   - Go to Repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `DEV_SSH_KEY` (or `STAGING_SSH_KEY`, `PRODUCTION_SSH_KEY`)
   - Value: Contents of `~/.ssh/github_actions_deploy` (private key)

### Server Setup

On your deployment server, create the application directory:

```bash
# Create app directory
sudo mkdir -p /opt/digichess
sudo chown $USER:$USER /opt/digichess
cd /opt/digichess

# Clone repository (or pull latest)
git clone https://github.com/webashrat/digichess.git .

# Copy and configure .env file
cp digichess-backend/env.example digichess-backend/.env
# Edit .env with production values

# Start services
cd digichess-backend
docker compose up -d
```

## Usage

### Running CI Checks

CI runs automatically on push/PR. To manually trigger:

1. Go to **Actions** tab in GitHub
2. Select **CI/CD Pipeline**
3. Click **Run workflow**

### Deploying

#### Automatic Deployment (Development)
- Push to `develop` branch → Auto-deploys to development

#### Manual Deployment
1. Go to **Actions** tab in GitHub
2. Select **Deploy to Development**
3. Click **Run workflow**
4. Select environment (development/staging/production)
5. Click **Run workflow**

## Workflow Status Badge

Add this to your README.md to show CI status:

```markdown
![CI/CD Pipeline](https://github.com/webashrat/digichess/workflows/CI/CD%20Pipeline/badge.svg)
```

## Troubleshooting

### CI Fails on Backend Test
- Check that all dependencies are in `requirements.txt`
- Verify Django settings are valid
- Ensure migrations are up to date

### CI Fails on Frontend Build
- Check Node.js version compatibility
- Verify all npm packages are installed
- Check for TypeScript errors

### Docker Build Fails
- Verify Dockerfile is correct
- Check that Stockfish source code is present
- Ensure all build dependencies are available

### Deployment Fails
- Verify SSH key is correct in GitHub Secrets
- Check server connectivity
- Ensure Docker Compose is installed on server
- Verify `.env` file exists on server

## Local Testing

Test workflows locally before pushing:

```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or download from: https://github.com/nektos/act

# Run CI workflow locally
act push

# Run specific job
act -j backend-test
```

## Best Practices

1. **Always test locally first** before pushing
2. **Review PR checks** before merging
3. **Deploy to staging** before production
4. **Monitor deployments** after pushing
5. **Keep secrets secure** - never commit credentials
6. **Use environment-specific configs** for different stages

## Pipeline Status

Check pipeline status at:
https://github.com/webashrat/digichess/actions

