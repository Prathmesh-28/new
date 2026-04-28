from .base import *  # noqa: F401, F403
from decouple import config as _config

DEBUG = False

# Only force HTTPS after SSL cert is installed on the server
SECURE_SSL_REDIRECT          = False
SECURE_PROXY_SSL_HEADER      = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE        = False
CSRF_COOKIE_SECURE           = False
SECURE_HSTS_SECONDS          = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD          = False

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
