"""
Health check views for monitoring and load balancers
"""
from django.http import JsonResponse
from django.db import connection


def healthz(request):
    """
    Health check endpoint for Render and load balancers.
    Returns 200 if the service is healthy, 500 otherwise.
    """
    try:
        # Check database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        
        return JsonResponse({
            "status": "healthy",
            "service": "digichess-backend"
        }, status=200)
    except Exception as e:
        return JsonResponse({
            "status": "unhealthy",
            "service": "digichess-backend",
            "error": str(e)
        }, status=500)


def readyz(request):
    """
    Readiness check endpoint.
    Returns 200 when the service is ready to accept traffic.
    """
    try:
        # Check database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        
        return JsonResponse({
            "status": "ready",
            "service": "digichess-backend"
        }, status=200)
    except Exception as e:
        return JsonResponse({
            "status": "not_ready",
            "service": "digichess-backend",
            "error": str(e)
        }, status=503)

