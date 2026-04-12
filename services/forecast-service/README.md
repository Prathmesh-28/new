# Forecast Service

This service implements the core cash flow forecasting engine for Headroom.

## Overview

The Forecast Service is responsible for:
- Fetching normalized transaction data for a tenant
- Detecting recurring transaction patterns
- Generating 90-day cash flow forecasts
- Storing forecast records and datapoints
- Exposing a REST API for forecast generation and retrieval

## Local Setup

```bash
cd services/forecast-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## API Endpoints

- `GET /health` - Service health
- `POST /forecast/generate` - Generate forecast
- `GET /forecast/{forecast_id}` - Retrieve forecast by id
- `GET /forecast/tenant/{tenant_id}/latest` - Get latest forecast for tenant
- `POST /forecast/recalculate?tenant_id={tenant_id}` - Recalculate forecast

## Notes
- This is a starter implementation and uses a simple projection model.
- Future work: integrate ML models, time series forecasting, and improved confidence bands.
