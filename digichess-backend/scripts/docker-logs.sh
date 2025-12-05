#!/bin/bash
# Helper script to view Docker logs

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

SERVICE=${1:-}

if [ -z "$SERVICE" ]; then
    echo "📋 Viewing logs for all services..."
    echo "Usage: $0 [service_name]"
    echo "Services: backend, celery, celery-beat, postgres, redis"
    echo ""
    $DOCKER_COMPOSE logs -f
else
    echo "📋 Viewing logs for $SERVICE..."
    $DOCKER_COMPOSE logs -f "$SERVICE"
fi

