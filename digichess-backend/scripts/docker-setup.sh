#!/bin/bash
# Helper script to set up Docker environment

set -e

# Detect docker compose command (modern plugin or legacy standalone)
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Neither 'docker compose' nor 'docker-compose' is available"
    echo "Please install Docker Compose"
    exit 1
fi

echo "🚀 DigiChess Docker Setup"
echo "========================="
echo "Using: $DOCKER_COMPOSE"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from env.example..."
    cp env.example .env
    echo "✅ Created .env file"
    echo "⚠️  Please edit .env file with your configuration before continuing!"
    echo ""
    read -p "Press Enter to continue after editing .env file..."
else
    echo "✅ .env file already exists"
fi

# Generate secret key if not set
if grep -q "your-secret-key-here" .env 2>/dev/null; then
    echo "🔑 Generating Django secret key..."
    SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/DJANGO_SECRET_KEY=.*/DJANGO_SECRET_KEY=$SECRET_KEY/" .env
    else
        # Linux
        sed -i "s/DJANGO_SECRET_KEY=.*/DJANGO_SECRET_KEY=$SECRET_KEY/" .env
    fi
    echo "✅ Generated and set Django secret key"
fi

echo ""
echo "🐳 Building Docker images..."
$DOCKER_COMPOSE build

echo ""
echo "🚀 Starting services..."
$DOCKER_COMPOSE up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "📦 Running migrations..."
$DOCKER_COMPOSE exec backend python manage.py migrate

echo ""
echo "👤 Creating superuser (optional)..."
read -p "Do you want to create a superuser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $DOCKER_COMPOSE exec backend python manage.py createsuperuser
fi

echo ""
echo "🎯 Setup complete!"
echo ""
echo "Services are running:"
echo "  - Backend API: http://localhost:8000"
echo "  - Admin panel: http://localhost:8000/admin"
echo ""
echo "Useful commands:"
echo "  - View logs: $DOCKER_COMPOSE logs -f"
echo "  - Stop services: $DOCKER_COMPOSE down"
echo "  - Restart services: $DOCKER_COMPOSE restart"
echo "  - Shell access: $DOCKER_COMPOSE exec backend python manage.py shell"
echo ""

