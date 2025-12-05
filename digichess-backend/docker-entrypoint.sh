#!/bin/bash
set -e

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

while retry < max_retries:
    try:
        r = redis.Redis(host=parsed.hostname or 'localhost', 
                       port=parsed.port or 6379, 
                       db=int(parsed.path[1:]) if parsed.path else 0,
                       socket_connect_timeout=1)
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

# Wait for dependencies
wait_for_db
wait_for_redis

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput

# Collect static files (if not in production, this might fail - that's ok)
echo "Collecting static files..."
python manage.py collectstatic --noinput || echo "Warning: Static files collection failed (this is ok for development)"

# Execute the command passed to the container
exec "$@"

