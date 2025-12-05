#!/bin/bash
# Helper wrapper to use either 'docker compose' (plugin) or 'docker-compose' (standalone)

# Try docker compose (plugin, modern)
if docker compose version > /dev/null 2>&1; then
    exec docker compose "$@"
# Fallback to docker-compose (standalone, legacy)
elif command -v docker-compose > /dev/null 2>&1; then
    exec docker-compose "$@"
else
    echo "Error: Neither 'docker compose' nor 'docker-compose' is available"
    echo "Please install Docker Compose:"
    echo "  - Modern Docker (20.10+): Already includes 'docker compose' plugin"
    echo "  - Legacy: sudo apt install docker-compose"
    exit 1
fi

