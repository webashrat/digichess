# Docker Testing Guide

## Testing the Docker Image Without Database

When testing the Docker image with commands that don't require a database connection (like `check`, `makemigrations`), the entrypoint script will automatically skip database setup.

### Commands That Skip Database Setup

These commands will automatically skip database/Redis connections:
- `python manage.py check`
- `python manage.py makemigrations`
- `python manage.py help`
- `python manage.py version`

### Example: Testing Django Configuration

```bash
# Build the image
docker build -t digichess-backend:test -f digichess-backend/Dockerfile digichess-backend/

# Run Django check (no database needed)
docker run --rm digichess-backend:test python manage.py check

# This should work without database connection errors
```

### Example: Testing with Database

For commands that need a database, use docker-compose:

```bash
# Start services
docker compose up -d postgres redis

# Run migrations
docker compose exec backend python manage.py migrate

# Run Django check with database
docker compose exec backend python manage.py check --deploy
```

## Manual Skip (Optional)

You can also manually skip database setup by setting an environment variable:

```bash
docker run --rm \
  -e SKIP_DB_SETUP=true \
  digichess-backend:test \
  python manage.py check
```

## CI/CD Testing

For CI/CD pipelines, you can test the image build and basic commands:

```yaml
- name: Build backend Docker image
  run: docker build -t digichess-backend:test -f digichess-backend/Dockerfile digichess-backend/

- name: Test backend image (no DB)
  run: docker run --rm digichess-backend:test python manage.py check
```

The entrypoint script will automatically detect that `check` doesn't need a database and skip all database operations.

