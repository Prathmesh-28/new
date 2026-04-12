# Database Setup & Development Guide

## Quick Start

### Prerequisites

- PostgreSQL 14+ (13+ minimum, tested on 16)
- Node.js 20+
- Docker & Docker Compose (optional, for containerized local dev)

### Local Development with Docker

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify connections
psql -h localhost -U postgres -d headroom -c "\dt"
redis-cli ping
```

### Initialize Database Schema

```bash
# From project root
npm run db:init

# This will:
# 1. Create all tables from src/db/schema.sql
# 2. Apply RLS policies from src/db/01-rls-policies.sql
# 3. Seed default data from src/db/seed.sql
```

### Environment Variables

```bash
# Copy and edit
cp .env.example .env.local

# Set database connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=headroom
DB_USER=postgres
DB_PASSWORD=postgres
```

---

## Database Architecture Overview

### Multi-Tenancy Model

**Shared schema with row-level security (RLS)**

```
┌─────────────────────────────────────┐
│        Application Layer            │
│  (Node.js/Python services)          │
└──────────────┬──────────────────────┘
               │
        ┌──────▼────────┐
        │ Set Tenant    │
        │ Context in    │
        │ Session       │
        └──────┬────────┘
               │
┌──────────────▼──────────────────┐
│   PostgreSQL with RLS Enforced  │
│                                 │
│  ┌──────────────────────────┐  │
│  │ SELECT * FROM orders     │  │
│  │ WHERE tenant_id =        │  │
│  │       $1 (implicit)      │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

Every query automatically filters by tenant — application bugs cannot leak cross-tenant data.

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `tenants` | Multi-tenancy anchor | id, name, subscription_tier, status |
| `users` | Authentication & roles | id, tenant_id, email, role, password_hash |
| `sessions` | Active user sessions | token, user_id, tenant_id, expires_at |
| `bank_connections` | Third-party integrations | tenant_id, provider, access_token, last_sync |
| `transactions` | Normalized financial data | tenant_id, date, amount, category, is_recurring |
| `forecasts` | Generated 90-day outlooks | tenant_id, generated_at, status, model_version |
| `forecast_datapoints` | Forecast values (p10/p50/p90) | forecast_id, date, balance_p10, balance_p50, balance_p90 |
| `credit_applications` | Credit marketplace entries | tenant_id, status, underwriting_score, score_breakdown |
| `credit_offers` | Lender offers | application_id, lender_partner, product_type, apr_equivalent |
| `capital_raises` | Capital campaigns | tenant_id, track (rev_share/reg_cf/reg_a+), status |
| `audit_log` | Compliance trail | tenant_id, user_id, action, resource_type, changes |

---

## Working with Tenants & RLS

### Setting Tenant Context in Application Code

```typescript
// src/lib/db.ts
import { pool } from './pool';

export async function withTenantContext(
  tenantId: string,
  callback: () => Promise<any>
) {
  const client = await pool.connect();
  try {
    // Set tenant context for all subsequent queries
    await client.query(
      'SELECT set_tenant_context($1::UUID)',
      [tenantId]
    );

    // Now all queries are automatically filtered
    return await callback();
  } finally {
    client.release();
  }
}

// Usage in route handlers
app.get('/api/transactions', async (req, res) => {
  const tenantId = req.session.tenant_id;
  
  await withTenantContext(tenantId, async () => {
    const result = await pool.query('SELECT * FROM transactions WHERE date > NOW() - INTERVAL 30 DAY');
    // RLS automatically enforces tenant_id = $1
    res.json(result.rows);
  });
});
```

### Bypassing RLS (Admin Only)

```sql
-- For admin operations, temporarily disable RLS
SET LOCAL session_replication_role TO replica; -- Disable RLS

-- Do admin query
SELECT * FROM transactions; -- No filtering

-- RLS re-enabled at transaction end
```

⚠️ **Only use in trusted admin contexts, never in customer-facing code.**

---

## Data Flow Patterns

### 1. Bank Account Connection

```
User connects bank (via Plaid) 
  ↓
bank_connections.status = 'pending'
  ↓
Scheduled job: sync transactions from provider
  ↓
Normalised transactions → transactions table
  ↓
ML: categorise each transaction
  ↓
transactions.category + transactions.is_recurring
  ↓
Forecast engine reads recurring patterns
```

### 2. Forecast Generation

```
Trigger: Daily at 2 AM (or on-demand)
  ↓
Read last 90 days of transactions
  ↓
Identify recurring patterns (payroll, rent, software)
  ↓
Extract inflows/outflows by category
  ↓
Run ML model → confidence bands (p10/p50/p90)
  ↓
Store in forecast_datapoints table
  ↓
If balance < threshold → create LOW_CASH_WARNING alert
```

### 3. Credit Application

```
User requests credit
  ↓
Create credit_application (status='draft')
  ↓
Silent underwriting: score signals
  ↓
Update credit_application.underwriting_score + score_breakdown
  ↓
fraud_check_status → pass/fail/review
  ↓
Match with lender partners
  ↓
Create credit_offer records
  ↓
User sees offers, selects one
  ↓
Mark as 'accepted' → create credit_active_loan record
  ↓
Disbursement tracking
```

---

## Common Queries

### Get tenant's transactions (last 30 days)

```sql
SELECT set_tenant_context('tenant-uuid'::UUID);

SELECT * FROM transactions 
WHERE date > CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC;
```

### Get tenant's active forecast

```sql
SELECT set_tenant_context('tenant-uuid'::UUID);

SELECT f.*, dp.date, dp.balance_p50
FROM forecasts f
LEFT JOIN forecast_datapoints dp ON dp.forecast_id = f.id
WHERE f.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND f.status = 'complete'
ORDER BY f.generated_at DESC LIMIT 90;
```

### Get credit applications with scores

```sql
SELECT set_tenant_context('tenant-uuid'::UUID);

SELECT 
  ca.id,
  ca.status,
  ca.underwriting_score,
  ca.score_breakdown->>'cash_flow_stability' AS cf_stability,
  ca.score_breakdown->>'fraud_check_status' AS fraud_status,
  COUNT(co.id) AS offer_count
FROM credit_applications ca
LEFT JOIN credit_offers co ON co.credit_application_id = ca.id
WHERE ca.tenant_id = current_setting('app.current_tenant_id')::UUID
GROUP BY ca.id
ORDER BY ca.created_at DESC;
```

---

## Migrations

### Creating a New Migration

```bash
# Create migration file
touch src/db/02-add-feature-x.sql

# Edit file with your SQL changes
# Always include:
# - Comments explaining the change
# - Safe ALTER TABLE statements (IF NOT EXISTS, etc.)
# - Index creation
# - RLS policies for new tables
```

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate

# This runs all .sql files in src/db/ in alphabetical order
```

### Example Migration

```sql
-- Migration: Add merchant analytics
-- Version: 2.0.0

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS merchant_category_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS mcc_description TEXT;

CREATE INDEX IF NOT EXISTS idx_txn_merchant_category 
ON transactions(merchant_category_code);
```

---

## Performance Tuning

### Indexes Already Created

- `tenant_id + date DESC` on `transactions` (for time-range queries)
- `tenant_id + status` on multiple tables (for filtering)
- `source_id` on `bank_connections` (for dedup)

### Add Custom Indexes

```sql
-- If you add frequent queries on a column
CREATE INDEX idx_custom ON transactions(category) 
WHERE tenant_id = ...;

-- For JSONB columns (forecast datapoints)
CREATE INDEX idx_forecast_p50 
ON forecast_datapoints USING gin (datapoints);
```

### Archive Old Forecasts

```sql
-- Monthly cleanup: move old forecasts to archive
INSERT INTO forecast_archive 
SELECT * FROM forecasts 
WHERE generated_at < CURRENT_DATE - INTERVAL '180 days';

DELETE FROM forecasts 
WHERE generated_at < CURRENT_DATE - INTERVAL '180 days';

-- Or move to S3 cold storage for compliance
```

---

## Backup & Recovery

### Local Backup

```bash
# Full backup
pg_dump -h localhost -U postgres headroom > backup.sql

# Restore
psql -h localhost -U postgres headroom < backup.sql
```

### Production (AWS RDS)

```bash
# Automated daily backups with 30-day retention
# Configured in infrastructure/terraform/database.tf

aws rds create-db-snapshot \
  --db-instance-identifier headroom-prod-db \
  --db-snapshot-identifier headroom-prod-backup-$(date +%Y%m%d)
```

---

## Security Best Practices

✅ **Do:**
- Always set tenant context before queries
- Use parameterised queries (avoid SQL injection)
- Rotate access tokens regularly
- Encrypt sensitive data at rest (AWS KMS)
- Log all data changes in audit_log
- Use RLS for permission enforcement

❌ **Don't:**
- Disable RLS in production
- Store plain-text passwords (use bcrypt + salts)
- Mix tenants in a single request
- Trust user input for tenant filtering
- Hardcode database passwords

---

## Troubleshooting

### RLS Errors

```
ERROR: new row violates row-level security policy for table "transactions"
```

**Cause:** Trying to insert/update a row with a different tenant_id than the current context.

**Fix:**
```sql
-- Verify current tenant context
SELECT current_setting('app.current_tenant_id');

-- Should match the row's tenant_id value
```

### Connection Pool Exhausted

```
remaining connection slots are reserved for non-replication superuser connections
```

**Fix:**
```typescript
// Ensure clients are released in finally blocks
const client = await pool.connect();
try {
  // Query...
} finally {
  client.release();
}
```

### Slow Forecast Queries

```sql
-- Analyze query plan
EXPLAIN ANALYZE
SELECT * FROM forecast_datapoints 
WHERE forecast_id = ... 
ORDER BY date DESC;

-- Add missing index if needed
CREATE INDEX idx_forecast_date ON forecast_datapoints(forecast_id, date DESC);
```

---

## Resources

- [PostgreSQL RLS Docs](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Row-Level Security Article](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Database Architecture](./DATABASE_ARCHITECTURE.md)
- [Schema Reference](../src/db/schema.sql)
