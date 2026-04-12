#!/bin/bash

# Headroom Development Environment Initialization Script
# Run this after: docker-compose up -d

set -e

echo "🚀 Initializing Headroom Development Environment..."

# Check if PostgreSQL is running
echo "⏳ Waiting for PostgreSQL to be ready..."
until psql -h localhost -U postgres -d postgres -c "\l" > /dev/null 2>&1; do
  echo "  PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "✅ PostgreSQL is ready"

# Check if Redis is running
echo "⏳ Waiting for Redis to be ready..."
until redis-cli -h localhost ping > /dev/null 2>&1; do
  echo "  Redis is unavailable - sleeping"
  sleep 1
done

echo "✅ Redis is ready"

# Copy environment file if it doesn't exist
if [ ! -f .env.local ]; then
  echo "📋 Creating .env.local from .env.example..."
  cp .env.example .env.local
  echo "⚠️  Please review and update .env.local with your settings"
else
  echo "✅ .env.local already exists"
fi

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install || { echo "❌ npm install failed"; exit 1; }

# Create database if it doesn't exist
echo "🗄️  Creating database..."
psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'headroom'" | grep -q 1 || psql -h localhost -U postgres -c "CREATE DATABASE headroom;" || true

# Run database migrations
echo "🗄️  Running database migrations..."
psql -h localhost -U postgres -d headroom < src/db/schema.sql || { echo "⚠️  Schema already exists, skipping"; }

# Seed database
echo "🌱 Seeding database with demo data..."
psql -h localhost -U postgres -d headroom < src/db/seed.sql || { echo "⚠️  Seed already applied, skipping"; }

echo ""
echo "✅ Environment initialization complete!"
echo ""
echo "📝 Demo Credentials:"
echo "   Email: admin@headroom.local"
echo "   Password: headroom@2024"
echo ""
echo "🚀 Start development server:"
echo "   npm run dev"
echo ""
echo "🌐 Open browser:"
echo "   http://localhost:3000"
echo ""
