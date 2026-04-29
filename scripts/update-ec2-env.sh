#!/usr/bin/env bash
# Run this on the EC2 server once:
#   chmod +x scripts/update-ec2-env.sh
#   ./scripts/update-ec2-env.sh
#
# It writes (or patches) /home/ubuntu/headroom-backend/.env with all production values.
# Adjust ENV_FILE and GUNICORN_SERVICE if your paths differ.

set -euo pipefail

ENV_FILE="${DJANGO_ENV_PATH:-/home/ubuntu/headroom-backend/.env}"
GUNICORN_SERVICE="${GUNICORN_SERVICE:-gunicorn}"

patch_or_append() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

echo "Patching $ENV_FILE ..."

patch_or_append DJANGO_ENV                 "production"
patch_or_append DJANGO_SERVICE_KEY         "GFK-aXmBU-0O_kEriQ56Og8kGsD1QbR94wvqczAw6fXUDfqUUdScInEX4wi1UiUo"
patch_or_append ALLOWED_HOSTS              "13.54.2.137,headroom-fc7e3.web.app,headroom-fc7e3.firebaseapp.com,localhost"
patch_or_append CORS_ALLOWED_ORIGINS       "https://headroom-fc7e3.web.app,https://headroom-fc7e3.firebaseapp.com,http://localhost:3000"
patch_or_append FRONTEND_URL               "https://headroom-fc7e3.web.app"
# Set these from your Google Cloud Console → OAuth 2.0 credentials
patch_or_append GOOGLE_OAUTH_CLIENT_ID     "${GOOGLE_OAUTH_CLIENT_ID:?set GOOGLE_OAUTH_CLIENT_ID env var}"
patch_or_append GOOGLE_OAUTH_CLIENT_SECRET "${GOOGLE_OAUTH_CLIENT_SECRET:?set GOOGLE_OAUTH_CLIENT_SECRET env var}"
patch_or_append TIME_ZONE                  "Asia/Kolkata"
patch_or_append LOG_LEVEL                  "INFO"
patch_or_append SECURE_SSL_REDIRECT        "False"

echo "Installing new Python dependencies ..."
cd "$(dirname "$ENV_FILE")"
pip install --quiet google-auth==2.35.0 google-auth-oauthlib==1.2.1 \
  boto3==1.35.0 "django-storages[s3]==1.14.4" bcrypt==4.2.0

echo "Running migrations ..."
python manage.py migrate --noinput

echo "Collecting static files ..."
python manage.py collectstatic --noinput

echo "Restarting gunicorn ..."
sudo systemctl restart "$GUNICORN_SERVICE"

echo "Done. Django is live."
