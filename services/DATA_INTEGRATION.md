# Data Integration Layer

This layer handles connecting to external data sources (banks, accounting platforms) and normalizing data into the Headroom unified schema.

## Overview

The Data Integration Layer handles:
- Bank account connections (OAuth + API integrations)
- Accounting platform sync (QuickBooks, Xero, Wave)
- Transaction normalization and deduplication
- Account classification
- Real-time and scheduled sync

## Architecture

```
External Data Sources
├─ Banks (via Plaid)
│  ├─ Checking accounts
│  ├─ Savings accounts
│  └─ Historical transactions
├─ Accounting Platforms
│  ├─ QuickBooks Online
│  ├─ Xero
│  ├─ Freshbooks
│  └─ Wave
└─ Direct Integrations
   ├─ Stripe (payments)
   ├─ PayPal
   └─ Merchant services

           ↓

Data Sync Workers (Python/AWS Lambda)
├─ Authentication & token refresh
├─ Transaction fetch
├─ Account reconciliation
└─ Rate-limited ingestion

           ↓

Normalization Engine
├─ Deduplication
├─ Category mapping
├─ Amount standardization
└─ Counterparty extraction

           ↓

PostgreSQL (transactions table)
```

## Supported Providers

### Banks (via Plaid)

Plaid provides unified API for 12,000+ financial institutions:

```bash
# Initialize connection
POST /data/bank-connections/link
Response: plaid_link_token

# User completes Plaid Link flow
# Callback receives public_token

POST /data/bank-connections/exchange
Input: { public_token }
Output: { access_token, account_ids[] }
```

Benefits:
- Standardized API across 12K+ institutions
- Real-time transactions
- Account balance and identity data
- Multi-account support
- Automatic token refresh

### Accounting Platforms

#### QuickBooks Online

```bash
POST /accounting/quickbooks/authorize
Query: ?code=OAUTH_AUTHORIZATION_CODE

Features:
- Invoice data
- Expense categorization
- Profit & loss sync
- Account codes mapping
```

#### Xero

```bash
POST /accounting/xero/authorize
Query: ?code=OAUTH_AUTHORIZATION_CODE

Features:
- Automatic categorization
- Tax tracking
- Multi-currency support
- Bill reconciliation
```

## Normalization Rules

### Category Mapping

```
Source              →  Normalized Category
────────────────────────────────────────
Salary Payment      →  Payroll
Contractor Invoice  →  Operating Expense
Equipment Purchase  →  Capital Expense
Loan Payment        →  Loan Payment
Quarterly Taxes     →  Tax
Transfer to Savings →  Transfer
Interest Income     →  Revenue
Product Sale        →  Revenue
```

### Deduplication

Multiple data sources can report the same transaction. Dedup based on:

```javascript
{
  date,
  amount,
  counterparty,
  account_id,
  source_id
}
```

If two transactions match on all fields within a 5-minute window, mark as duplicate.

### Confidence Scoring

Each transaction gets a confidence score:

```
Perfect match with QuickBooks invoice          → 0.95
Bank transaction + Accounting categorization  → 0.80
Bank transaction only                         → 0.60
Manual entry                                  → 0.50
```

Used for forecast weighting.

## Sync Schedule

**Real-time Triggers:**
- Bank balance drops below threshold
- Unexpected large transaction
- Account connection error

**Scheduled Syncs:**
- Bank transactions: Every 6 hours
- Accounting platforms: Daily at 1 AM
- Account balances: Every 4 hours

## Error Handling

**Transient Errors** (retry with exponential backoff):
- Network timeout
- Rate limit hit
- Temporary API unavailability

**Permanent Errors** (alert user):
- Invalid credentials
- Connection revoked
- Account no longer available
- Unsupported account type

## Credentials Storage

```
┌─── AWS Secrets Manager ───────┐
│ /headroom/tenant/{ID}/oauth   │
│ ├─ plaid_access_token         │
│ ├─ quickbooks_refresh_token   │
│ └─ xero_refresh_token         │
└───────────────────────────────┘
         (Encrypted at rest)
         (Logged access in CloudTrail)
```

## Rate Limiting

Each provider has quotas:

- **Plaid**: 50 requests/second per org
- **QuickBooks**: 500 requests/minute per app
- **Xero**: 1000 API calls per 5 minutes

Headroom queues requests with adaptive backoff.

## Data Privacy

CCPA/GDPR compliance:

- ✅ Minimal scope: Only read transactions (no write access)
- ✅ Data minimization: Store only what's needed
- ✅ Deletion on request: Remove all connection data within 30 days
- ✅ Encryption in transit (HTTPS) and at rest (AWS KMS)
- ✅ Audit logging: All access logged in `audit_log` table
- ✅ Consent: Users explicitly authorize each connection

## Setup & Deployment

### Environment Variables

```env
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=production  # sandbox or production

QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
QUICKBOOKS_REALM_ID=...

XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...

# AWS
AWS_LAMBDA_FUNCTION_NAME=headroom-data-sync
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../...
```

### Lambda Deployment

```bash
# Direct Lambda deployment
./scripts/deploy-data-sync.sh

# Or: Terraform
cd terraform/
terraform apply -target=aws_lambda_function.data_sync
```

## Testing

```bash
# Test Plaid connection
curl -X POST http://localhost:3000/api/data/test-plaid \
  -H "Content-Type: application/json" \
  -d '{"access_token": "..."}'

# Test deduplication
npm run test -- data/__tests__/deduplication.test.ts

# Test normalization
npm run test -- data/__tests__/normalization.test.ts
```

## Monitoring

CloudWatch metrics:

```
DataSyncWorkers/
├─ SuccessfulSyncs (count, gauge)
├─ FailedSyncs (count, gauge)
├─ TransactionsIngested (count, gauge)
├─ SyncLatency (milliseconds, histogram)
├─ DuplicatesDetected (count, gauge)
└─ CredentialErrors (count, gauge)
```

Alerts trigger if:
- 2 consecutive sync failures
- Sync latency > 5 minutes
- Missing credentials error
