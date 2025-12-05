#!/bin/bash
# Helper script to download Maia models inside the Docker container

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

echo "📥 Downloading Maia Chess models..."
echo "This may take a while as models are ~1-2GB total"
echo ""

$DOCKER_COMPOSE exec backend python manage.py setup_maia --all

echo ""
echo "✅ Maia models download complete!"

