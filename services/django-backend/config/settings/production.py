from .base import *  # noqa: F401, F403
from decouple import config as _config

DEBUG = False

# Render terminates SSL at the load balancer — trust X-Forwarded-Proto
SECURE_SSL_REDIRECT            = False
SECURE_PROXY_SSL_HEADER        = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE          = True
CSRF_COOKIE_SECURE             = True
SECURE_HSTS_SECONDS            = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD            = True
SECURE_CONTENT_TYPE_NOSNIFF    = True

# Whitenoise v6+ compatible storage
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"

# Redis with short timeouts so a dead Redis doesn't block every request
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _config("REDIS_URL", default="redis://localhost:6379/0"),
        "OPTIONS": {
            "socket_connect_timeout": 2,
            "socket_timeout": 2,
        },
    }
}
