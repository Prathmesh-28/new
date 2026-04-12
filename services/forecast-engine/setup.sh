#!/bin/bash

# Forecast Engine Development Setup

echo "🚀 Setting up Forecast Engine development environment..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9+ first."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo "❌ Python 3.9+ required. Current version: $PYTHON_VERSION"
    exit 1
fi

echo "✅ Python $PYTHON_VERSION detected"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please update .env with your actual configuration values"
fi

# Check if database is running
echo "🔍 Checking database connection..."
python3 -c "
import psycopg2
import os
from dotenv import load_dotenv
load_dotenv()

try:
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'headroom'),
        user=os.getenv('DB_USER', 'postgres'),
        password=os.getenv('DB_PASSWORD', 'postgres')
    )
    conn.close()
    print('✅ Database connection successful')
except Exception as e:
    print('⚠️  Database not accessible:', str(e))
    print('   Make sure PostgreSQL is running and headroom database exists')
"

# Check if Redis is running
echo "🔍 Checking Redis connection..."
python3 -c "
import redis
import os
from dotenv import load_dotenv
load_dotenv()

try:
    r = redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', '6379')),
        password=os.getenv('REDIS_PASSWORD'),
        db=int(os.getenv('REDIS_DB', '0'))
    )
    r.ping()
    print('✅ Redis connection successful')
except Exception as e:
    print('⚠️  Redis not accessible:', str(e))
    print('   Make sure Redis is running')
"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the Forecast Engine:"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
echo "The service will be available at:"
echo "  http://localhost:8001"
echo ""
echo "Health check:"
echo "  curl http://localhost:8001/health"
echo ""
echo "Test forecast generation:"
echo "  curl -X POST http://localhost:8001/forecast/550e8400-e29b-41d4-a716-446655440000/trigger"
echo ""
echo "Get forecast:"
echo "  curl http://localhost:8001/forecast/550e8400-e29b-41d4-a716-446655440000"
