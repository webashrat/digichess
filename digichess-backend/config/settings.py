import os
from pathlib import Path

from dotenv import load_dotenv
from celery.schedules import crontab


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [
    host for host in os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",") if host
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "channels",
    "rest_framework",
    "rest_framework.authtoken",
    "accounts",
    "social",
    "games",
    "notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "postgres"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.JWTOrTokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@example.com")
SERVER_EMAIL = os.getenv("SERVER_EMAIL", DEFAULT_FROM_EMAIL)

OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))
AUTH_ACCESS_TOKEN_MINUTES = int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "15"))
AUTH_REFRESH_TOKEN_DAYS = int(os.getenv("AUTH_REFRESH_TOKEN_DAYS", "180"))
AUTH_REFRESH_INACTIVITY_DAYS = int(os.getenv("AUTH_REFRESH_INACTIVITY_DAYS", "60"))
AUTH_REFRESH_COOKIE_NAME = os.getenv("AUTH_REFRESH_COOKIE_NAME", "digichess_refresh")


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


AUTH_REFRESH_COOKIE_SECURE = _env_bool("AUTH_REFRESH_COOKIE_SECURE", not DEBUG)
AUTH_REFRESH_COOKIE_SAMESITE = os.getenv("AUTH_REFRESH_COOKIE_SAMESITE", "Lax")
AUTH_REFRESH_COOKIE_PATH = os.getenv("AUTH_REFRESH_COOKIE_PATH", "/api/accounts/")
AUTH_REFRESH_COOKIE_DOMAIN = os.getenv("AUTH_REFRESH_COOKIE_DOMAIN", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://digichess.local")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
DIGIQUIZ_QUESTION_BANK_PATH = os.getenv(
    "DIGIQUIZ_QUESTION_BANK_PATH",
    str(BASE_DIR / "quiz_10000_questions_pretty.json"),
)
DIGIQUIZ_ALLOW_PREOFFICIAL = os.getenv("DIGIQUIZ_ALLOW_PREOFFICIAL", "True").lower() == "true"

# Lichess API Configuration
LICHESS_API_TOKEN = os.getenv("LICHESS_API_TOKEN", "")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
        },
    }
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TASK_DEFAULT_QUEUE = os.getenv("CELERY_TASK_DEFAULT_QUEUE", "scm_default")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


CELERY_BEAT_SCHEDULE = {
    "store_daily_rating_snapshots": {
        "task": "games.tasks.store_daily_rating_snapshots",
        "schedule": crontab(minute=0, hour=0),  # Run daily at 00:00 UTC
    },
    "check_game_timeouts": {
        "task": "games.tasks.check_game_timeouts",
        "schedule": _env_float("GAME_TIMEOUT_CHECK_INTERVAL", 5.0),
    },
    "check_first_move_timeouts": {
        "task": "games.tasks.check_first_move_timeouts",
        "schedule": _env_float("FIRST_MOVE_TIMEOUT_CHECK_INTERVAL", 5.0),
    },
    "check_pending_challenge_expiry": {
        "task": "games.tasks.check_pending_challenge_expiry",
        "schedule": _env_float("PENDING_CHALLENGE_EXPIRY_INTERVAL", 60.0),
    },
    "check_tournament_start": {
        "task": "games.tasks.check_tournament_start",
        "schedule": _env_float("TOURNAMENT_CHECK_START_INTERVAL", 10.0),
    },
    "check_tournament_finish": {
        "task": "games.tasks.check_tournament_finish",
        "schedule": _env_float("TOURNAMENT_CHECK_FINISH_INTERVAL", 10.0),
    },
    "pair_arena_idle_players": {
        "task": "games.tasks.pair_arena_idle_players",
        "schedule": _env_float("TOURNAMENT_PAIR_ARENA_INTERVAL", 5.0),
    },
    "cleanup_orphaned_tournament_games": {
        "task": "games.tasks.cleanup_orphaned_tournament_games",
        "schedule": 60.0,
    },
    "prepare_daily_digiquiz_round": {
        "task": "games.tasks.prepare_daily_digiquiz_round",
        # 23:25 IST daily = 17:55 UTC
        "schedule": crontab(minute=55, hour=17),
    },
    "tick_digiquiz_rounds": {
        "task": "games.tasks.tick_digiquiz_rounds",
        "schedule": _env_float("DIGIQUIZ_TICK_INTERVAL", 2.0),
    },
}

# CORS / CSRF
cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
if cors_origins_env:
    # Strip whitespace and trailing slashes from origins
    CORS_ALLOWED_ORIGINS = [
        o.strip().rstrip("/") for o in cors_origins_env.split(",") if o.strip()
    ]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://storage.googleapis.com",
        "http://digichess-frontend-6759.storage.googleapis.com",
    ]

csrf_origins_env = os.getenv("CSRF_TRUSTED_ORIGINS", "")
if csrf_origins_env:
    # Strip whitespace and trailing slashes from origins
    CSRF_TRUSTED_ORIGINS = [
        o.strip().rstrip("/") for o in csrf_origins_env.split(",") if o.strip()
    ]
else:
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://storage.googleapis.com",
        "http://digichess-frontend-6759.storage.googleapis.com",
    ]
CORS_ALLOW_CREDENTIALS = True
