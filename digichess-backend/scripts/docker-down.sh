#!/bin/bash
# Helper script to stop and clean up Docker environment

set -e

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

echo "🛑 Stopping DigiChess services..."
$DOCKER_COMPOSE down

echo ""
read -p "Do you want to remove volumes (this will delete all data)? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing volumes..."
    $DOCKER_COMPOSE down -v
    echo "✅ Volumes removed"
else
    echo "✅ Services stopped (volumes preserved)"
fi

echo ""
echo "Done!"

