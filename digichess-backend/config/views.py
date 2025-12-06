"""
Health check views for monitoring and load balancers
"""
import os
from django.http import JsonResponse
from django.db import connection
from urllib.parse import urlparse


def _check_database():
    """Check if database is accessible"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "connected", "error": None}
    except Exception as e:
        return {"status": "disconnected", "error": str(e)}


def _check_redis():
    """Check if Redis is accessible"""
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        parsed = urlparse(redis_url)
        
        db = int(parsed.path.lstrip("/") or 0)
        use_ssl = parsed.scheme in ("rediss", "rediss+ssl", "tls")
        username = parsed.username
        password = parsed.password
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        
        r = redis.Redis(
            host=host,
            port=port,
            db=db,
            username=username,
            password=password,
            ssl=use_ssl,
            socket_connect_timeout=2,
        )
        r.ping()
        return {"status": "connected", "error": None}
    except Exception as e:
        return {"status": "disconnected", "error": str(e)}


def _check_celery_worker():
    """Check if Celery Worker is running"""
    try:
        from config.celery import app
        inspect = app.control.inspect(timeout=2)
        active_workers = inspect.active()
        
        if active_workers:
            worker_count = len(active_workers)
            return {
                "status": "running",
                "worker_count": worker_count,
                "workers": list(active_workers.keys()),
                "error": None
            }
        else:
            return {
                "status": "not_running",
                "worker_count": 0,
                "workers": [],
                "error": "No active workers found"
            }
    except Exception as e:
        return {
            "status": "unknown",
            "worker_count": 0,
            "workers": [],
            "error": str(e)
        }


def _check_celery_beat():
    """Check if Celery Beat is running by checking for beat lock in Redis"""
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        parsed = urlparse(redis_url)
        
        db = int(parsed.path.lstrip("/") or 0)
        use_ssl = parsed.scheme in ("rediss", "rediss+ssl", "tls")
        username = parsed.username
        password = parsed.password
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        
        r = redis.Redis(
            host=host,
            port=port,
            db=db,
            username=username,
            password=password,
            ssl=use_ssl,
            socket_connect_timeout=2,
        )
        
        # Check for Celery Beat lock key (Celery Beat stores its lock in Redis)
        beat_lock_key = "celerybeat-schedule"
        beat_exists = r.exists(beat_lock_key)
        
        # Also check for beat runtime info
        beat_info = r.get(beat_lock_key)
        
        if beat_exists or beat_info:
            return {"status": "running", "error": None}
        else:
            # Beat might be running but hasn't created lock yet, check if tasks are scheduled
            # This is a best-effort check
            return {"status": "unknown", "error": "Beat lock not found (may still be starting)"}
    except Exception as e:
        return {"status": "unknown", "error": str(e)}


def healthz(request):
    """
    Health check endpoint for Render and load balancers.
    Returns 200 if the service is healthy, 500 otherwise.
    """
    db_check = _check_database()
    
    if db_check["status"] == "connected":
        return JsonResponse({
            "status": "healthy",
            "service": "digichess-backend",
            "database": db_check["status"]
        }, status=200)
    else:
        return JsonResponse({
            "status": "unhealthy",
            "service": "digichess-backend",
            "database": db_check["status"],
            "error": db_check["error"]
        }, status=500)


def readyz(request):
    """
    Readiness check endpoint with comprehensive service status.
    Returns 200 when all critical services are ready, 503 otherwise.
    """
    db_check = _check_database()
    redis_check = _check_redis()
    celery_worker_check = _check_celery_worker()
    celery_beat_check = _check_celery_beat()
    
    # All critical services must be ready
    all_ready = (
        db_check["status"] == "connected" and
        redis_check["status"] == "connected" and
        celery_worker_check["status"] == "running"
    )
    
    response_data = {
        "status": "ready" if all_ready else "not_ready",
        "service": "digichess-backend",
        "checks": {
            "database": db_check["status"],
            "redis": redis_check["status"],
            "celery_worker": {
                "status": celery_worker_check["status"],
                "worker_count": celery_worker_check.get("worker_count", 0),
                "workers": celery_worker_check.get("workers", [])
            },
            "celery_beat": celery_beat_check["status"]
        }
    }
    
    # Add error details if any service failed
    errors = {}
    if db_check["error"]:
        errors["database"] = db_check["error"]
    if redis_check["error"]:
        errors["redis"] = redis_check["error"]
    if celery_worker_check["error"]:
        errors["celery_worker"] = celery_worker_check["error"]
    if celery_beat_check["error"]:
        errors["celery_beat"] = celery_beat_check["error"]
    
    if errors:
        response_data["errors"] = errors
    
    status_code = 200 if all_ready else 503
    return JsonResponse(response_data, status=status_code)

