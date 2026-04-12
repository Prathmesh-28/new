# API Endpoint Reference

## Overview

Headroom uses a **REST API** accessed via AWS API Gateway at custom domain `api.headroom.app` (or local dev at configured URL).

**Authentication**: Session cookie-based (httpOnly, 8-hour TTL)
**Rate Limiting**: API keys support 1000 req/minute (configurable per tier)
**Response Format**: JSON
**TLS**: Required on production (automatic via AWS ACM)

---

## Authentication Endpoints

### POST `/api/admin/login`

Authenticate with email and password. Creates session token.

**Request:**
```json
{
  "email": "admin@headroom.local",
  "password": "headroom@2024"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "admin@headroom.local",
    "role": "admin",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

**Sets Cookie:**
```
hr_admin_session=<SESSION_TOKEN>; HttpOnly; Secure; SameSite=Strict; Max-Age=28800
```

---

### POST `/api/admin/logout`

End current session. Requires valid session cookie.

**Request:**
```
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### GET `/api/admin/session`

Retrieve current user and tenant context. Used by frontend on mount.

**Request:**
```
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "admin@headroom.local",
  "role": "admin",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_name": "Demo Tenant"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Session expired or invalid"
}
```

---

## Forecast Service Endpoints

**Base URL:** `https://api.headroom.app/forecast` (or `http://localhost:8001` for local dev)

All endpoints require `tenant_id` query parameter and valid session.

### GET `/forecast/forecast`

Retrieve latest 90-day forecast for tenant.

**Query Parameters:**
- `tenant_id` (required, format: UUID)

**Request:**
```
GET /forecast/forecast?tenant_id=550e8400-e29b-41d4-a716-446655440000
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
{
  "id": "forecast-uuid",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "generated_at": "2024-01-15T14:32:00Z",
  "status": "complete",
  "model_version": "1.0.0",
  "datapoints": [
    {
      "date": "2024-01-15",
      "balance_p10": 45000,
      "balance_p50": 52000,
      "balance_p90": 62000,
      "confidence_score": 0.87
    },
    {
      "date": "2024-01-16",
      "balance_p10": 44500,
      "balance_p50": 51800,
      "balance_p90": 61500,
      "confidence_score": 0.86
    }
  ]
}
```

**Response (404 Not Found):**
```json
{
  "error": "No forecast found for tenant"
}
```

---

### POST `/forecast/generate`

Trigger forecast generation (background job).

**Query Parameters:**
- `tenant_id` (required, format: UUID)

**Request:**
```
POST /forecast/generate?tenant_id=550e8400-e29b-41d4-a716-446655440000
Cookie: hr_admin_session=<SESSION_TOKEN>
Content-Type: application/json

{
  "lookback_days": 90
}
```

**Response (202 Accepted):**
```json
{
  "message": "Forecast generation started",
  "job_id": "job-uuid",
  "estimated_completion": "2024-01-15T15:05:00Z"
}
```

---

### GET `/forecast/alerts`

Retrieve cash flow alerts for tenant.

**Query Parameters:**
- `tenant_id` (required, format: UUID)
- `severity` (optional: critical, warning, info)

**Request:**
```
GET /forecast/alerts?tenant_id=550e8400-e29b-41d4-a716-446655440000&severity=critical
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
[
  {
    "id": "alert-uuid",
    "type": "LOW_CASH_WARNING",
    "severity": "critical",
    "message": "Cash balance projected below $10k on 2024-02-15",
    "projected_date": "2024-02-15",
    "projected_balance": 8500,
    "threshold_balance": 10000,
    "created_at": "2024-01-15T14:32:00Z",
    "resolved_at": null
  }
]
```

---

## Credit Service Endpoints

**Base URL:** `https://api.headroom.app/credit` (or `http://localhost:8002` for local dev)

All endpoints require `tenant_id` query parameter and valid session.

### GET `/credit/applications`

List all credit applications for tenant.

**Query Parameters:**
- `tenant_id` (required, format: UUID)
- `status` (optional: draft, pending, approved, rejected)
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Request:**
```
GET /credit/applications?tenant_id=550e8400-e29b-41d4-a716-446655440000&status=approved
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
{
  "total": 3,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "id": "app-uuid-1",
      "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "approved",
      "amount_requested": 50000,
      "underwriting_score": 78,
      "score_breakdown": {
        "cash_flow_stability": 0.82,
        "revenue_growth": 0.75,
        "debt_to_income": 0.70,
        "business_age": 0.80
      },
      "fraud_check_status": "pass",
      "created_at": "2024-01-10T10:00:00Z",
      "expires_at": "2024-04-10T10:00:00Z"
    }
  ]
}
```

---

### POST `/credit/applications`

Create new credit application.

**Request:**
```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount_requested": 50000,
  "use_case": "Working capital"
}
```

**Response (201 Created):**
```json
{
  "id": "app-uuid",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "amount_requested": 50000,
  "use_case": "Working capital",
  "underwriting_score": null,
  "score_breakdown": null,
  "fraud_check_status": null,
  "created_at": "2024-01-15T14:32:00Z",
  "expires_at": null
}
```

---

### GET `/credit/applications/{id}`

Get detailed credit application.

**Path Parameters:**
- `id` (required, format: UUID)

**Query Parameters:**
- `tenant_id` (required, format: UUID)

**Request:**
```
GET /credit/applications/app-uuid-1?tenant_id=550e8400-e29b-41d4-a716-446655440000
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
{
  "id": "app-uuid-1",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "approved",
  "amount_requested": 50000,
  "underwriting_score": 78,
  "score_breakdown": {
    "cash_flow_stability": 0.82,
    "revenue_growth": 0.75,
    "debt_to_income": 0.70,
    "business_age": 0.80
  },
  "fraud_check_status": "pass",
  "offers": [
    {
      "id": "offer-uuid-1",
      "status": "pending",
      "lender_partner": "Lender Inc",
      "product_type": "revenue_advance",
      "amount": 50000,
      "factor_rate": 1.25,
      "apr_equivalent": 0.42,
      "repayment_pct": 0.08,
      "repayment_floor": 500,
      "repayment_ceil_pct": 2000,
      "term_months_est": 12
    }
  ],
  "created_at": "2024-01-10T10:00:00Z",
  "expires_at": "2024-04-10T10:00:00Z"
}
```

---

### GET `/credit/offers`

List all credit offers for tenant.

**Query Parameters:**
- `tenant_id` (required, format: UUID)
- `application_id` (optional, filter by application)
- `status` (optional: pending, accepted, rejected)

**Request:**
```
GET /credit/offers?tenant_id=550e8400-e29b-41d4-a716-446655440000
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
[
  {
    "id": "offer-uuid-1",
    "application_id": "app-uuid-1",
    "lender_partner": "Lender Inc",
    "product_type": "revenue_advance",
    "amount": 50000,
    "factor_rate": 1.25,
    "apr_equivalent": 0.42,
    "repayment_pct": 0.08,
    "repayment_floor": 500,
    "repayment_ceil_pct": 2000,
    "term_months_est": 12,
    "status": "pending",
    "created_at": "2024-01-12T10:00:00Z"
  }
]
```

---

### POST `/credit/offers/{id}/accept`

Accept a credit offer.

**Path Parameters:**
- `id` (required, format: UUID)

**Request:**
```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK):**
```json
{
  "id": "offer-uuid-1",
  "status": "accepted",
  "active_loan_id": "loan-uuid-1",
  "disbursement_date": "2024-01-20"
}
```

---

## Capital Service Endpoints

**Base URL:** `https://api.headroom.app/capital` (or `http://localhost:8003` for local dev)

All endpoints require `tenant_id` query parameter and valid session.

### GET `/capital/raises`

List all capital raise campaigns.

**Query Parameters:**
- `tenant_id` (required, format: UUID)
- `track` (optional: rev_share, reg_cf, reg_a+)
- `status` (optional: draft, active, closed)

**Request:**
```
GET /capital/raises?tenant_id=550e8400-e29b-41d4-a716-446655440000&track=rev_share
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
[
  {
    "id": "raise-uuid-1",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "track": "rev_share",
    "status": "active",
    "name": "Growth Capital Round 2024",
    "target_amount": 500000,
    "raised_amount": 175000,
    "investor_count": 12,
    "launch_date": "2024-01-01",
    "close_date": "2024-06-30",
    "created_at": "2023-12-15T10:00:00Z"
  }
]
```

---

### POST `/capital/raises`

Create new capital raise campaign.

**Request:**
```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "track": "rev_share",
  "name": "Growth Capital Round 2024",
  "target_amount": 500000,
  "description": "Funding for product development and hiring",
  "terms": {
    "revenue_share_percent": 0.08,
    "minority_equity_percent": 0.05,
    "preferred_return": 1.2
  }
}
```

**Response (201 Created):**
```json
{
  "id": "raise-uuid-1",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "track": "rev_share",
  "status": "draft",
  "name": "Growth Capital Round 2024",
  "target_amount": 500000,
  "raised_amount": 0,
  "investor_count": 0,
  "created_at": "2024-01-15T14:32:00Z"
}
```

---

### GET `/capital/investors`

List all investors for a raise campaign.

**Query Parameters:**
- `tenant_id` (required, format: UUID)
- `raise_id` (required, format: UUID)

**Request:**
```
GET /capital/investors?tenant_id=550e8400-e29b-41d4-a716-446655440000&raise_id=raise-uuid-1
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
[
  {
    "id": "investor-uuid-1",
    "raise_id": "raise-uuid-1",
    "investor_name": "John Doe",
    "email": "john@example.com",
    "investment_amount": 25000,
    "status": "funded",
    "funded_date": "2024-01-10",
    "created_at": "2024-01-05T10:00:00Z"
  }
]
```

---

## Bank Connection Endpoints

**Base URL:** `https://api.headroom.app/bank` (or `http://localhost:8004` for local dev)

### GET `/bank/connections`

List connected bank accounts.

**Query Parameters:**
- `tenant_id` (required, format: UUID)

**Request:**
```
GET /bank/connections?tenant_id=550e8400-e29b-41d4-a716-446655440000
Cookie: hr_admin_session=<SESSION_TOKEN>
```

**Response (200 OK):**
```json
[
  {
    "id": "conn-uuid-1",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "plaid",
    "provider_account_id": "acc_123456789",
    "account_name": "Main Operating Account",
    "account_type": "checking",
    "status": "active",
    "last_sync": "2024-01-15T12:00:00Z",
    "sync_frequency_hours": 6
  }
]
```

---

### POST `/bank/disconnect`

Disconnect a bank account.

**Request:**
```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "connection_id": "conn-uuid-1"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bank connection disconnected"
}
```

---

## Error Responses

All errors follow standard HTTP status codes:

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Missing required query parameter |
| 401 | Unauthorized | Invalid or expired session |
| 403 | Forbidden | User lacks permission for resource |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource or invalid state |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error (check logs) |

**Error Response Format:**
```json
{
  "error": "Resource not found",
  "error_code": "RESOURCE_NOT_FOUND",
  "details": {
    "resource_type": "credit_application",
    "resource_id": "app-uuid"
  }
}
```

---

## Rate Limiting

API Gateway applies rate limits per API key:

- **Free Tier**: 100 req/minute
- **Pro Tier**: 1000 req/minute
- **Enterprise**: Custom limits

**Response Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1705330800
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit` (default: 50, max: 1000)
- `offset` (default: 0)

**Response:**
```json
{
  "total": 250,
  "limit": 50,
  "offset": 0,
  "data": [...]
}
```

---

## Testing Endpoints

### Local Development

```bash
# Start services
docker-compose up -d

# Test auth
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@headroom.local","password":"headroom@2024"}'

# Test forecast
curl http://localhost:8001/forecast/forecast?tenant_id=550e8400-e29b-41d4-a716-446655440000 \
  -H "Cookie: hr_admin_session=$SESSION_TOKEN"

# Test credit
curl http://localhost:8002/credit/applications?tenant_id=550e8400-e29b-41d4-a716-446655440000 \
  -H "Cookie: hr_admin_session=$SESSION_TOKEN"

# Test capital
curl http://localhost:8003/capital/raises?tenant_id=550e8400-e29b-41d4-a716-446655440000 \
  -H "Cookie: hr_admin_session=$SESSION_TOKEN"
```

### Production Staging

All production API calls should use `https://api-staging.headroom.app` before deploying to production.

---

## Client Libraries

### JavaScript/TypeScript

The frontend includes a ready-to-use API client at `src/lib/api.ts`:

```typescript
import { forecastApi, creditApi, capitalApi, adminApi } from '@/lib/api';

// Login
const user = await adminApi.login('admin@headroom.local', 'password');

// Get forecast
const forecast = await forecastApi.getForecast(tenantId);

// Get credit applications
const apps = await creditApi.getApplications(tenantId);

// Get capital raises
const raises = await capitalApi.getRaises(tenantId);
```

### Other Languages

For Python, Go, Ruby, etc., construct HTTP requests following the endpoint specifications in this guide. Include:
- Valid session cookie: `hr_admin_session=<TOKEN>`
- Required query parameters: `tenant_id=<UUID>`
- Request headers: `Content-Type: application/json`
- TLS certificate validation on production

---

## Changelog

### v1.0.0 (2024-01-15)

- Initial API release
- Authentication endpoints (login, logout, session)
- Forecast endpoints (retrieve, generate, alerts)
- Credit endpoints (applications, offers, acceptance)
- Capital endpoints (raises, investors)
- Bank connection endpoints (list, disconnect)
- Rate limiting via API keys
- RLS-based tenant isolation
