#!/bin/bash
# Helper script to access Django shell or run management commands

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

SERVICE=${1:-backend}
shift
COMMAND=${*:-shell}

if [ "$COMMAND" = "shell" ]; then
    echo "🐚 Opening Django shell..."
    $DOCKER_COMPOSE exec "$SERVICE" python manage.py shell
else
    echo "🔧 Running command: $COMMAND"
    $DOCKER_COMPOSE exec "$SERVICE" python manage.py "$@"
fi

