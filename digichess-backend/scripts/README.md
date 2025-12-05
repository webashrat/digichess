# Docker Helper Scripts

Helper scripts to simplify Docker operations for DigiChess backend.

## Available Scripts

### `docker-setup.sh`

Complete setup script for first-time deployment. This is the easiest way to get started!

```bash
./scripts/docker-setup.sh
```

**What it does:**
- Creates `.env` file from `env.example` if it doesn't exist
- Generates Django secret key automatically
- Builds all Docker images
- Starts all services
- Runs database migrations
- Optionally creates superuser

### `docker-down.sh`

Stop and optionally clean up all Docker services.

```bash
# Stop services (preserves data)
./scripts/docker-down.sh

# When prompted, choose 'y' to remove volumes (deletes all data)
```

### `docker-logs.sh`

View logs from Docker services.

```bash
# View all logs
./scripts/docker-logs.sh

# View logs from specific service
./scripts/docker-logs.sh backend
./scripts/docker-logs.sh celery
./scripts/docker-logs.sh postgres
```

### `docker-shell.sh`

Access Django shell or run management commands.

```bash
# Open Django shell
./scripts/docker-shell.sh

# Run specific management command
./scripts/docker-shell.sh backend migrate
./scripts/docker-shell.sh backend createsuperuser
./scripts/docker-shell.sh backend shell
```

### `download-maia-models.sh`

Download all Maia Chess neural network models (for human-like bot play).

```bash
./scripts/download-maia-models.sh
```

**Note:** This downloads ~1-2GB of model files and may take 10-30 minutes depending on your connection.

## Usage Examples

### First Time Setup

```bash
cd digichess-backend
./scripts/docker-setup.sh
```

### Daily Development

```bash
# Start services
docker-compose up -d

# View logs
./scripts/docker-logs.sh backend

# Open Django shell
./scripts/docker-shell.sh

# Stop when done
./scripts/docker-down.sh
```

### Download Maia Models

```bash
# Start services first
docker-compose up -d

# Download models
./scripts/download-maia-models.sh
```

## Alternative: Direct Docker Compose

You can also use `docker-compose` commands directly:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Run commands
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py shell

# Stop services
docker-compose down
```

The helper scripts are just convenient wrappers around these commands!

