#!/bin/bash

# API Gateway Development Setup

echo "🚀 Setting up API Gateway development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version 20+ required. Current version: $(node -v)"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please update .env with your actual configuration values"
fi

# Check if database is running
echo "🔍 Checking database connection..."
if command -v psql &> /dev/null; then
    if psql -h localhost -U postgres -d headroom -c "SELECT 1;" &> /dev/null; then
        echo "✅ Database connection successful"
    else
        echo "⚠️  Database not accessible. Make sure PostgreSQL is running and headroom database exists"
    fi
else
    echo "⚠️  psql not found. Make sure PostgreSQL client is installed"
fi

# Check if Redis is running
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis connection successful"
    else
        echo "⚠️  Redis not accessible. Make sure Redis is running"
    fi
else
    echo "⚠️  redis-cli not found. Make sure Redis client is installed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the API Gateway:"
echo "  npm run dev"
echo ""
echo "The API will be available at:"
echo "  http://localhost:3001"
echo ""
echo "Health check:"
echo "  curl http://localhost:3001/health"
echo ""
echo "Test login:"
echo "  curl -X POST http://localhost:3001/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"admin@headroom.local\",\"password\":\"headroom@2024\"}'"
