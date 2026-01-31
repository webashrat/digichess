#!/bin/bash
set -e

# Multi-service startup script for Render (FREE - runs all services in one container)
# This script runs setup then starts: Daphne + Celery Worker + Celery Beat
# Usage: /start-all.sh (called after entrypoint does setup)

echo "========================================="
echo "Starting DigiChess All Services"
echo "========================================="

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "========================================="
    echo "Shutting down all services..."
    echo "========================================="
    kill $(jobs -p) 2>/dev/null || true
    wait
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGTERM SIGINT

# Start Celery Worker in background
echo "[1/3] Starting Celery Worker..."
celery -A config worker -l info -Q scm_default,scm_emails --concurrency=4 &
CELERY_WORKER_PID=$!
echo "   ??? Celery Worker started (PID: $CELERY_WORKER_PID)"

# Start Celery Beat in background
echo "[2/3] Starting Celery Beat..."
celery -A config beat -l info &
CELERY_BEAT_PID=$!
echo "   ??? Celery Beat started (PID: $CELERY_BEAT_PID)"

# Wait a moment for Celery services to initialize
echo "[3/3] Waiting for Celery services to initialize..."
sleep 3

# Start Daphne in foreground (this keeps the container alive)
echo "========================================="
echo "Starting Daphne (ASGI server) on port 8000..."
echo ""
echo "??? All services are now running:"
echo "   ??? Daphne (ASGI) - Port 8000"
echo "   ??? Celery Worker - Queues: scm_default, scm_emails"
echo "   ??? Celery Beat - Scheduler"
echo "========================================="
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application

