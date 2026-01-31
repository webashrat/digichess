#!/bin/bash
set -e

# Commands that don't need database/Redis connection
NO_DB_COMMANDS=("check" "makemigrations" "help" "version" "compilemessages" "makemessages" "--help" "-h")

# Check if the command needs database
needs_database() {
    if [ $# -eq 0 ]; then
        return 0  # Default command (daphne) needs database
    fi
    
    # Convert all arguments to a string for easier checking
    local cmd_line="$*"
    
    # Check if this is a management command that doesn't need DB
    for no_db_cmd in "${NO_DB_COMMANDS[@]}"; do
        # Check if command contains the no-db command (e.g., "manage.py check")
        if [[ "$cmd_line" == *"manage.py $no_db_cmd"* ]] || [[ "$cmd_line" == *"$no_db_cmd"* ]]; then
            return 1  # Doesn't need database
        fi
    done
    
    return 0  # Needs database
}

# Function to wait for database
wait_for_db() {
    if [ -z "$DB_HOST" ]; then
        return
    fi
    
    echo "Waiting for database at $DB_HOST:${DB_PORT:-5432}..."
    until python -c "
import socket
import sys
import time

host = '$DB_HOST'
port = ${DB_PORT:-5432}
max_retries = 30
retry = 0

while retry < max_retries:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        if result == 0:
            sys.exit(0)
    except Exception:
        pass
    retry += 1
    time.sleep(1)

sys.exit(1)
"; do
        echo "Database is unavailable - sleeping"
        sleep 1
    done
    
    echo "Database is ready!"
}

# Function to wait for Redis
wait_for_redis() {
    if [ -z "$REDIS_URL" ]; then
        return
    fi
    
    echo "Waiting for Redis..."
    until python -c "
import redis
import sys
import os
from urllib.parse import urlparse

redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
parsed = urlparse(redis_url)
max_retries = 30
retry = 0

# Support TLS and password-protected Redis (e.g., Upstash)
db = int(parsed.path.lstrip('/') or 0)
use_ssl = parsed.scheme in ('rediss', 'rediss+ssl', 'tls')
username = parsed.username
password = parsed.password
host = parsed.hostname or 'localhost'
port = parsed.port or 6379

while retry < max_retries:
    try:
        r = redis.Redis(
            host=host,
            port=port,
            db=db,
            username=username,
            password=password,
            ssl=use_ssl,
            socket_connect_timeout=1,
        )
        r.ping()
        sys.exit(0)
    except Exception:
        pass
    retry += 1

sys.exit(1)
"; do
        echo "Redis is unavailable - sleeping"
        sleep 1
    done
    
    echo "Redis is ready!"
}

# Check if we should skip database setup
SKIP_DB=${SKIP_DB_SETUP:-"false"}

# Guard: Celery should never run migrations/DB setup
if [[ "$*" == *"celery"* ]] && [ "$SKIP_DB" != "true" ]; then
    echo "Warning: Celery command detected without SKIP_DB_SETUP=true; skipping DB setup to avoid migration races."
    SKIP_DB="true"
fi

# Check if command needs database
if [ "$SKIP_DB" = "true" ] || ! needs_database "$@"; then
    echo "Skipping database setup for command: $@"
else
    # Wait for dependencies
    wait_for_db
    wait_for_redis
    
    # Run database migrations
    echo "Running database migrations..."
    python manage.py migrate --noinput || echo "Warning: Migrations failed (this is ok if database is not available)"
    
    # Collect static files (if not in production, this might fail - that's ok)
    echo "Collecting static files..."
    python manage.py collectstatic --noinput || echo "Warning: Static files collection failed (this is ok for development)"
    
    # Create/update bots (DIGI, JDR, RAJ)
    echo "Creating/updating bots..."
    python manage.py create_bots || echo "Warning: Bot creation failed (this is ok if bots already exist)"
fi

# Execute the command passed to the container
exec "$@"

