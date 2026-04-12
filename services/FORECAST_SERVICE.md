# Forecast Service

This service implements the core forecasting engine that generates 90-day cash flow projections.

## Overview

The Forecast Service handles:
- Transaction normalization and categorization
- Recurring pattern detection
- 90-day projection modeling (best-case, expected, downside)
- Confidence level calculation
- Anomaly detection for alerts

## Architecture

```
Forecast Service (Python/ECS)
├─ Data Input Layer
│  ├─ PostgreSQL (transactions)
│  └─ Redis (cache)
├─ Processing Layer
│  ├─ Normalization engine
│  ├─ Pattern detection
│  ├─ ML model inference
│  └─ Scenario generation
└─ Output Layer
   ├─ PostgreSQL (forecasts, forecast_datapoints)
   └─ Event Bus (forecast_completed event)
```

## Key Components

### 1. Transaction Normalization

- Categorize: revenue, operating_expense, capital_expense, payroll, loan_payment, tax, transfer, other
- Deduplicate: Prevent double-counting between accounts
- Enrich: Add counterparty, tags, metadata

### 2. Pattern Detection

- Identify recurring transactions
- Score confidence (0-1) for recurrence likelihood
- Detect seasonality and anomalies
- Flag one-time expenses vs. recurring

### 3. Forecast Generation

- Base Model: Historical patterns + external variables
- Best Case: +15% variance assumption
- Expected Case: Historical mean
- Downside Case: -25% variance assumption
- 90-day rolling forecast updated daily

### 4. Alert Generation

- Low cash warning: Projected date balance drops below threshold
- Anomaly detected: Transaction outside normal bounds
- Burn rate spike: Sudden increase in expenses
- Revenue gap: Expected revenue not received

## API Endpoints

```
POST /forecast/generate
  Input: { tenant_id, window_days: 90 }
  Output: { forecast_id, status, datapoints[] }

GET /forecast/:forecast_id
  Returns: Full forecast with 90 datapoints

GET /forecast/:tenant_id/latest
  Returns: Most recent forecast for tenant

POST /forecast/recalculate
  Input: { tenant_id }
  Triggers: Async recalculation, posts event
```

## Environment Setup

```bash
cd services/forecast-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run service
python -m app.main

# Service runs on port 8001
```

## Development

```bash
# Watch mode with reload
python -m app.main --watch

# Run tests
pytest tests/ -v

# Type checking
mypy app/

# Linting
flake8 app/
```

## Deployment

```bash
# Build Docker image
docker build -t headroom-forecast:latest .

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag headroom-forecast:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/headroom-forecast:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/headroom-forecast:latest

# Deploy to ECS Fargate
# See terraform/ directory for infrastructure
```

## Database Schema Used

- `transactions` - normalized transaction data
- `forecasts` - forecast metadata
- `forecast_datapoints` - daily forecast values
- `alerts` - generated alerts

## Event Bus Integration

Publishes events to AWS SNS:
- `forecast.generated` - New forecast created
- `forecast.error` - Forecast generation failed
- `alert.created` - Alert generated

## ML Model

Uses ensemble approach:
- ARIMA for trend forecasting
- Seasonal decomposition for patterns
- XGBoost for anomaly scoring
- Expert rules for business logic (payroll, quarterly taxes)

Model located in `app/models/forecast_v1.pkl`
