from pathlib import Path
from datetime import timedelta
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ── Core ───────────────────────────────────────────────────────────────────────
SECRET_KEY  = config("DJANGO_SECRET_KEY", default="django-insecure-change-me-in-production")
DEBUG       = config("DJANGO_DEBUG", default=False, cast=bool)
ENVIRONMENT = config("DJANGO_ENV", default="production")  # production | development | staging

ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="*", cast=Csv())

# ── Installed apps ─────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "django_celery_beat",
    "django_celery_results",
    "storages",
]

LOCAL_APPS = [
    "apps.core",
    "apps.auth_api",
    "apps.organizations",
    "apps.forecast",
    "apps.alerts",
    "apps.datasync",
    "apps.underwriting",
    "apps.credit",
    "apps.capital",
    "apps.webhooks",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ── Middleware ─────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF     = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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

# ── Database ───────────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE":       "django.db.backends.postgresql",
        "NAME":         config("DB_NAME",     default="headroom"),
        "USER":         config("DB_USER",     default="postgres"),
        "PASSWORD":     config("DB_PASSWORD", default="postgres"),
        "HOST":         config("DB_HOST",     default="localhost"),
        "PORT":         config("DB_PORT",     default="5432"),
        "OPTIONS":      {"options": "-c search_path=public"},
        "CONN_MAX_AGE": config("DB_CONN_MAX_AGE", default=60, cast=int),
    }
}

AUTH_USER_MODEL = "core.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── Internationalisation ───────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE     = config("TIME_ZONE", default="Asia/Kolkata")
USE_I18N      = True
USE_TZ        = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Static & Media ─────────────────────────────────────────────────────────────
STATIC_URL  = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL   = "/media/"
MEDIA_ROOT  = BASE_DIR / "media"
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"

# ── AWS ────────────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID       = config("AWS_ACCESS_KEY_ID",       default="")
AWS_SECRET_ACCESS_KEY   = config("AWS_SECRET_ACCESS_KEY",   default="")
AWS_REGION              = config("AWS_REGION",              default="ap-southeast-2")
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_CUSTOM_DOMAIN    = config("AWS_S3_CUSTOM_DOMAIN",    default="")
AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
AWS_DEFAULT_ACL          = "private"
AWS_S3_FILE_OVERWRITE    = False
AWS_QUERYSTRING_AUTH     = True
AWS_S3_SIGNATURE_VERSION = "s3v4"

# Use S3 for media when bucket is set
if AWS_STORAGE_BUCKET_NAME:
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN or f'{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com'}/"

# AWS SES
AWS_SES_REGION_NAME       = config("AWS_SES_REGION_NAME",       default=AWS_REGION)
AWS_SES_FROM_EMAIL        = config("AWS_SES_FROM_EMAIL",        default="noreply@headroom.finance")
AWS_SES_CONFIGURATION_SET = config("AWS_SES_CONFIGURATION_SET", default="")
AWS_SES_SMTP_USER         = config("AWS_SES_SMTP_USER",         default="")
AWS_SES_SMTP_PASSWORD     = config("AWS_SES_SMTP_PASSWORD",     default="")

if AWS_SES_SMTP_USER and AWS_SES_SMTP_PASSWORD:
    EMAIL_BACKEND       = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST          = f"email-smtp.{AWS_SES_REGION_NAME}.amazonaws.com"
    EMAIL_PORT          = 587
    EMAIL_USE_TLS       = True
    EMAIL_HOST_USER     = AWS_SES_SMTP_USER
    EMAIL_HOST_PASSWORD = AWS_SES_SMTP_PASSWORD
    DEFAULT_FROM_EMAIL  = AWS_SES_FROM_EMAIL
else:
    EMAIL_BACKEND      = "django.core.mail.backends.console.EmailBackend"
    DEFAULT_FROM_EMAIL = "noreply@headroom.local"

# ── Redis / Cache ──────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "socket_connect_timeout": 2,
            "socket_timeout": 2,
        },
        "KEY_PREFIX": "headroom",
    }
}

# ── Celery ─────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL         = config("CELERY_BROKER_URL",    default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND     = config("CELERY_RESULT_BACKEND", default="django-db")
CELERY_ACCEPT_CONTENT     = ["json"]
CELERY_TASK_SERIALIZER    = "json"
CELERY_RESULT_SERIALIZER  = "json"
CELERY_TIMEZONE           = TIME_ZONE
CELERY_BEAT_SCHEDULER     = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TASK_ALWAYS_EAGER  = config("CELERY_TASK_ALWAYS_EAGER", default=False, cast=bool)
CELERY_WORKER_CONCURRENCY = config("CELERY_WORKER_CONCURRENCY", default=2, cast=int)
CELERY_TASK_SOFT_TIME_LIMIT = 300
CELERY_TASK_TIME_LIMIT      = 600

# ── CORS ───────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="https://headroom-fc7e3.web.app,https://headroom-fc7e3.firebaseapp.com,http://localhost:3000",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept", "authorization", "content-type", "origin",
    "x-requested-with", "x-service-key", "x-user-id",
]

# ── Django REST Framework ──────────────────────────────────────────────────────
DJANGO_SERVICE_KEY = config("DJANGO_SERVICE_KEY", default="")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.auth_api.service_auth.ServiceKeyAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": config("API_PAGE_SIZE", default=50, cast=int),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": config("THROTTLE_ANON", default="60/minute"),
        "user": config("THROTTLE_USER", default="300/minute"),
    },
}

# ── Simple JWT ─────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":    timedelta(minutes=config("JWT_ACCESS_LIFETIME_MINUTES", default=60, cast=int)),
    "REFRESH_TOKEN_LIFETIME":   timedelta(days=config("JWT_REFRESH_LIFETIME_DAYS",      default=7,  cast=int)),
    "ROTATE_REFRESH_TOKENS":    True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES":        ("Bearer",),
    "USER_ID_FIELD":            "id",
    "USER_ID_CLAIM":            "user_id",
    "TOKEN_OBTAIN_SERIALIZER":  "apps.auth_api.serializers.CustomTokenObtainPairSerializer",
    "ALGORITHM":                "HS256",
    "SIGNING_KEY":              SECRET_KEY,
}

# ── Google OAuth ───────────────────────────────────────────────────────────────
GOOGLE_OAUTH_CLIENT_ID       = config("GOOGLE_OAUTH_CLIENT_ID",       default="")
GOOGLE_OAUTH_CLIENT_SECRET   = config("GOOGLE_OAUTH_CLIENT_SECRET",   default="")
# Leave empty to allow all Google accounts; set e.g. "yourcompany.com" to restrict
GOOGLE_OAUTH_ALLOWED_DOMAINS = config("GOOGLE_OAUTH_ALLOWED_DOMAINS", default="", cast=Csv())

# ── Plaid ──────────────────────────────────────────────────────────────────────
PLAID_CLIENT_ID      = config("PLAID_CLIENT_ID",      default="")
PLAID_SECRET         = config("PLAID_SECRET",         default="")
PLAID_ENV            = config("PLAID_ENV",            default="sandbox")
PLAID_PRODUCTS       = config("PLAID_PRODUCTS",       default="transactions,auth", cast=Csv())
PLAID_COUNTRY_CODES  = config("PLAID_COUNTRY_CODES",  default="IN,US", cast=Csv())

# ── Stripe ─────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY     = config("STRIPE_SECRET_KEY",     default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")
STRIPE_PRICE_STARTER  = config("STRIPE_PRICE_STARTER",  default="")
STRIPE_PRICE_GROWTH   = config("STRIPE_PRICE_GROWTH",   default="")
STRIPE_PRICE_PRO      = config("STRIPE_PRICE_PRO",      default="")
STRIPE_PRICE_CAPITAL  = config("STRIPE_PRICE_CAPITAL",  default="")

# ── Fraud / KYC ────────────────────────────────────────────────────────────────
SARDINE_API_KEY     = config("SARDINE_API_KEY",     default="")
SARDINE_CLIENT_ID   = config("SARDINE_CLIENT_ID",   default="")
SARDINE_ENVIRONMENT = config("SARDINE_ENVIRONMENT", default="sandbox")

# ── Internal ───────────────────────────────────────────────────────────────────
DJANGO_API_URL = config("DJANGO_API_URL", default="http://localhost:8000")
FRONTEND_URL   = config("FRONTEND_URL",   default="https://headroom-fc7e3.web.app")
SUPPORT_EMAIL  = config("SUPPORT_EMAIL",  default="support@headroom.finance")
APP_NAME       = config("APP_NAME",       default="Headroom")

# ── Logging ────────────────────────────────────────────────────────────────────
LOG_LEVEL = config("LOG_LEVEL", default="INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{levelname}] {asctime} {module} {process:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django":         {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "ERROR",   "propagate": False},
        "apps":           {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "celery":         {"handlers": ["console"], "level": "INFO",    "propagate": False},
    },
}
