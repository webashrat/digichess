#!/bin/bash
# Performance testing script
# Run this inside Docker container or with Django environment activated

echo "=========================================="
echo "DigiChess Backend Performance Tests"
echo "=========================================="
echo ""

# Check if we're in Docker or have Django
if [ -f "/app/manage.py" ]; then
    cd /app
elif [ -f "manage.py" ]; then
    cd digichess-backend
else
    echo "Error: Cannot find manage.py. Run this from project root or inside Docker container."
    exit 1
fi

echo "[1/2] Running performance test command..."
python manage.py test_performance --iterations 50

echo ""
echo "[2/2] Running Django test suite for performance tests..."
python manage.py test games.tests.performance_tests -v 2

echo ""
echo "=========================================="
echo "Performance Tests Complete"
echo "=========================================="

