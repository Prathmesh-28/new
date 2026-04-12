# Quick Start: Running Backend Services Locally

## Prerequisites

- Node.js 20+
- Python 3.9+
- PostgreSQL 14+ (or Docker)
- Redis 7+ (or Docker)
- Docker & Docker Compose (optional, but recommended)

## Option 1: Docker Compose (Recommended for beginners)

### Setup

```bash
# Clone the repository (if needed)
cd ~/Downloads/new

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f api-gateway
docker-compose logs -f forecast-engine
```

### Access Services

```bash
# API Gateway health check
curl http://localhost:3001/health

# Forecast Engine health check
curl http://localhost:8001/health

# PostgreSQL connections
psql -h localhost -U postgres -d headroom

# Redis CLI
redis-cli -h localhost -p 6379
```

### Shutdown

```bash
docker-compose down

# Include volumes if you want to delete data
docker-compose down -v
```

---

## Option 2: Local Setup (For active development)

### 1. Setup API Gateway

```bash
cd services/api-gateway

# Run setup script
./setup.sh

# Or manually:
npm install

# Start development server
npm run dev

# In another terminal, test:
curl http://localhost:3001/health
```

### 2. Setup Forecast Engine

```bash
cd services/forecast-engine

# Run setup script
./setup.sh

# Or manually:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start development server
python main.py

# In another terminal, test:
curl http://localhost:8001/health
```

### 3. Ensure Database & Redis

```bash
# Start PostgreSQL & Redis (you have several options)

# Option A: Docker containers (without Docker Compose)
docker run -d --name headroom-db -p 5432:5432 \
  -e POSTGRES_DB=headroom \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16

docker run -d --name headroom-redis -p 6379:6379 \
  redis:7-alpine

# Option B: Homebrew (macOS)
brew install postgresql redis
brew services start postgresql
brew services start redis

# Option C: Using existing Docker Compose just for database
cd /path/to/project
docker-compose up -d db redis
```

---

## Testing the Backend

### Health Checks

```bash
# API Gateway
curl -v http://localhost:3001/health

# Forecast Engine
curl -v http://localhost:8001/health

# Output should be:
# {"status":"ok","timestamp":"2024-04-11T...","version":"1.0.0"}
```

### Authentication Flow

```bash
# 1. Login to get JWT token
export RESPONSE=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@headroom.local",
    "password": "headroom@2024"
  }')

echo $RESPONSE | jq .

# Extract token
export TOKEN=$(echo $RESPONSE | jq -r '.accessToken')
echo "Token: $TOKEN"

# 2. Use token in subsequent requests
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/accounts
```

### Get/Trigger Forecast

```bash
# Get latest forecast (may be empty initially)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/forecast

# Trigger forecast generation
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/forecast/trigger \
  -d '{"force": true}'

# Wait a few seconds, then retrieve the forecast
sleep 5
curl -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/forecast
```

### List Transactions

```bash
# Get all transactions (paginated by default: limit=50)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/transactions"

# With filters
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/transactions?category=software&minAmount=100"

# Pagination
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/transactions?limit=10&offset=50"
```

### Credit Operations

```bash
# Submit credit application
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/credit/apply \
  -d '{
    "amountRequested": 50000,
    "useCase": "Working capital for inventory expansion"
  }'

# Get pre-qualified offers
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/credit/offers

# Get active loans
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/loans
```

### Create Forecast Scenario

```bash
# New hire scenario
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/forecast/scenarios \
  -d '{
    "name": "Hire 2 Developers",
    "type": "new_hire",
    "parameters": {
      "salary": 120000,
      "start_date": "2024-05-01",
      "count": 2
    }
  }'

# Contract won scenario
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/organisations/550e8400-e29b-41d4-a716-446655440000/forecast/scenarios \
  -d '{
    "name": "Enterprise Contract",
    "type": "contract_won",
    "parameters": {
      "amount": 150000,
      "payment_terms": 30
    }
  }'
```

---

## Common Issues & Fixes

### Database Connection Failed

**Error**: `connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Check if database is running
docker ps | grep postgres

# Or using Homebrew
brew services list

# Start it
docker-compose up -d db
# or
brew services start postgresql
```

### Redis Connection Timeout

**Error**: `Redis error: ECONNREFUSED`

**Solution**:
```bash
# Check Redis
docker ps | grep redis
redis-cli ping

# Start it
docker-compose up -d redis
# or
brew services start redis
```

### JWT Verification Failed

**Error**: `Invalid or expired token`

**Solution**:
```bash
# Make sure your JWT_SECRET matches in all services
# Check .env file in api-gateway

# Generate a new token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@headroom.local","password":"headroom@2024"}'
```

### Port Already in Use

**Error**: `listen EADDRINUSE: address already in use :::3001`

**Solution**:
```bash
# Kill the process using the port
lsof -i :3001
kill -9 <PID>

# Or use a different port
export PORT=3002
npm run dev
```

---

## Environment Variables

### API Gateway `.env`

```env
# Required
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-key-change-in-production

# Optional
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
```

### Forecast Engine `.env`

```env
# Required
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional
PORT=8001
LOG_LEVEL=info
```

---

## Monitoring & Debugging

### API Gateway Logs

```bash
# Watch real-time logs
docker-compose logs -f api-gateway

# Or in local terminal:
npm run dev  # logs will display in terminal

# With prettified output
npm run dev | npx pino-pretty
```

### Forecast Engine Logs

```bash
# Watch real-time logs
docker-compose logs -f forecast-engine

# Or in local terminal:
python main.py  # logs will display in terminal
```

### Database Queries

```bash
# Connect to database
psql -h localhost -U postgres -d headroom

# List all tables
\dt

# View schema for a table
\d transactions

# Count records
SELECT COUNT(*) FROM transactions;

# Get latest forecast
SELECT * FROM forecasts ORDER BY created_at DESC LIMIT 1;

# Check tenant context
SELECT current_setting('app.current_tenant_id');
```

### Redis CLI

```bash
# Connect
redis-cli

# List all keys
KEYS *

# Get forecast cache
GET forecast:550e8400-e29b-41d4-a716-446655440000

# Monitor events in real time
SUBSCRIBE headroom.events
```

---

## Development Workflow

### Make Changes to API Gateway

```bash
cd services/api-gateway

# Edit files as needed (TypeScript + auto-reload)
npm run dev

# The server will automatically reload on file changes

# Test your changes
curl http://localhost:3001/health
```

### Make Changes to Forecast Engine

```bash
cd services/forecast-engine

# Edit main.py or add new modules
python main.py

# Server will restart on file changes (if using watchdog)

# Test your changes
curl http://localhost:8001/health
```

### Testing Before Commit

```bash
# Lint code
npm run lint

# Type check
npm run type-check

# Build (catches any TypeScript errors)
npm run build

# Run tests (if any)
npm test
```

---

## Performance Testing

### Load Test API Gateway

```bash
# Using Apache Bench
ab -n 1000 -c 100 http://localhost:3001/health

# Using wrk (if available)
wrk -t4 -c100 -d30s http://localhost:3001/health
```

### Profile Forecast Generation

```bash
# From Python shell
python3 << 'EOF'
import time
from main import forecast_engine

tenant_id = "550e8400-e29b-41d4-a716-446655440000"

start = time.time()
forecast = forecast_engine.generate_forecast(tenant_id)
end = time.time()

print(f"Forecast generation took {end - start:.2f} seconds")
print(f"Generated {len(forecast['datapoints'])} datapoints")
EOF
```

---

## Next Steps

1. **Explore the code**:
   - Read through `services/api-gateway/src/routes/organisations.ts`
   - Understand the forecast algorithm in `services/forecast-engine/main.py`
   - Check the event bus implementation in `services/event-bus/index.ts`

2. **Build the missing services**:
   - Credit Service (see `services/CREDIT_SERVICE.md`)
   - Capital Service (see `services/CAPITAL_SERVICE.md`)
   - Data Sync Workers (see `services/DATA_INTEGRATION.md`)

3. **Deploy to staging**:
   - Follow `infrastructure/DEPLOYMENT_CHECKLIST.md`
   - Use `infrastructure/terraform/` to provision AWS resources
   - Set up monitoring with Datadog

4. **Go to production**:
   - Run full integration tests
   - Load test all services
   - Set up runbooks for incidents

---

## Useful Links

- Architecture: `services/SERVICES_ARCHITECTURE.md`
- API Reference: `infrastructure/API_REFERENCE.md`
- Event Bus: `services/event-bus/README.md`
- Database: `infrastructure/DATABASE_ARCHITECTURE.md`
- Deployment: `infrastructure/DEPLOYMENT_CHECKLIST.md`
