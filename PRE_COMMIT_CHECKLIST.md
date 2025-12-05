# Pre-Commit Checklist

## ✅ Before Pushing to Main

### 1. Check for Sensitive Files

Make sure these are NOT committed:
- ❌ `.env` files (should be in .gitignore)
- ❌ Database passwords
- ❌ API keys
- ❌ Secret keys

**Verify:**
```bash
# Check if any .env files are staged (should be empty)
git status --short | grep "\.env$"

# Check .gitignore includes .env
grep "\.env" .gitignore
```

### 2. Files Ready to Commit

**New Docker/Deployment Files:**
- ✅ `digichess-backend/Dockerfile`
- ✅ `digichess-backend/docker-compose.yml`
- ✅ `digichess-backend/docker-entrypoint.sh`
- ✅ `digichess-backend/.dockerignore`
- ✅ `digichess-backend/env.example` (template, safe to commit)

**New Documentation:**
- ✅ All `.md` files we created
- ✅ Deployment guides

**Modified Files:**
- ✅ `digichess-backend/requirements.txt` (added Celery)

### 3. Commit Strategy

**Option 1: Single Commit (Recommended)**
```bash
git add .
git commit -m "Add Docker deployment setup and CI/CD configuration

- Add Dockerfile for backend with Stockfish and lc0 support
- Add docker-compose.yml for local development
- Add deployment documentation and guides
- Update requirements.txt with Celery
- Add environment configuration templates"
```

**Option 2: Multiple Commits (More Organized)**
```bash
# Commit Docker setup
git add digichess-backend/Dockerfile digichess-backend/docker-compose.yml digichess-backend/.dockerignore digichess-backend/docker-entrypoint.sh
git commit -m "Add Docker configuration for backend deployment"

# Commit documentation
git add *.md digichess-backend/*.md
git commit -m "Add deployment and setup documentation"

# Commit other changes
git add .
git commit -m "Update dependencies and configuration"
```

### 4. Verify Before Push

```bash
# Check what will be committed
git status

# Preview the commit
git diff --cached

# Make sure no sensitive files
git status --short | grep -i "\.env\|secret\|password\|key"
```

### 5. Push to Main

```bash
# Push to main branch
git push origin main

# Or if you need to set upstream
git push -u origin main
```

## 🚨 Important Reminders

1. **NEVER commit `.env` files** - They contain secrets
2. **env.example is OK** - It's a template without real values
3. **Review changes** before committing
4. **Test locally** before pushing

## Files That Should NOT Be Committed

- `digichess-backend/.env` (if exists)
- Any file with real API keys
- Database passwords
- Django SECRET_KEY (real values)

## Ready to Push?

Once you've verified everything, run:

```bash
# Stage all changes
git add .

# Review what's staged
git status

# Commit with message
git commit -m "Add Docker deployment setup and documentation"

# Push to main
git push origin main
```

