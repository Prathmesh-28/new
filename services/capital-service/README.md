# Capital Service

This service implements the public capital-raising infrastructure for Headroom.

## Overview

The Capital Service is responsible for:
- Creating and managing capital raise campaigns
- Publishing active raises
- Recording investor investments
- Providing dataroom document access

## Local Setup

```bash
cd services/capital-service
npm install
npm run dev
```

## API Endpoints

- `GET /health` - Service health
- `POST /capital/raises` - Create a new capital raise
- `PATCH /capital/raises/:id` - Update a raise
- `POST /capital/raises/:id/publish` - Publish a raise to active
- `POST /capital/investors/:id/invest` - Create new investor investment
- `GET /capital/raises/:id/dataroom` - Retrieve dataroom documents

## Notes
- This is a starter implementation with placeholder document listings.
- Future work: integrate compliance workflow, investor onboarding, and escrow/distribution logic.
