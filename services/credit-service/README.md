# Credit Service

This service provides the embedded credit marketplace and underwriting engine for Headroom.

## Overview

The Credit Service is responsible for:
- Creating credit applications
- Submitting applications for underwriting
- Returning lender offers
- Accepting credit offers

## Local Setup

```bash
cd services/credit-service
npm install
npm run dev
```

## API Endpoints

- `GET /health` - Service health
- `POST /credit/applications` - Create a new draft application
- `POST /credit/applications/:id/submit` - Submit application and return offers
- `GET /credit/applications/:id` - Get application details
- `POST /credit/offers/:id/accept` - Accept an offer

## Notes
- This is a starting implementation with stubbed offer generation.
- Future work: integrate real lender APIs, underwriting models, and risk scoring.
