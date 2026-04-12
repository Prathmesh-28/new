# Headroom Database Architecture

## Multi-Tenancy Strategy

Headroom uses a **shared-schema, row-level-security (RLS)** multi-tenancy model. Every table carries a `tenant_id` column. PostgreSQL RLS policies enforce tenant isolation at the database layer — application bugs cannot leak cross-tenant data because the DB enforces the boundary independently.

### Why not separate schemas per tenant?

**Operational cost.** At 100K tenants, managing 100K schemas for migrations, backups, and monitoring is unmanageable. Shared schema with RLS gives 95% of the isolation at 10% of the operational overhead.

### Isolation Enforcement

Each query must set the current tenant context using:

```sql
SELECT set_tenant_context('tenant-uuid'::UUID);
```

All subsequent queries will automatically filter by that tenant. The database enforces it — not the application.

---

## Core Schema — Tenants and Users

### Tenants (Multi-Tenancy Anchor)

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  subscription_tier VARCHAR(50) NOT NULL DEFAULT 'starter', 
    -- starter | growth | pro | capital
  status VARCHAR(50) NOT NULL DEFAULT 'active',
    -- active, inactive, suspended
  max_bank_connections INTEGER DEFAULT 2,
  features JSONB DEFAULT '{}', -- Feature flags per tier
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

Every other table references `tenant_id`. RLS policies on all tables enforce that queries can only access their assigned tenant's data.

### Users

```sql
CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'investor', 'admin');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  role user_role NOT NULL DEFAULT 'owner',
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive, invited
  external_id VARCHAR(255), -- For OAuth/SSO integration
  last_login TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(tenant_id, email),
  CONSTRAINT valid_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);
```

**Roles:**
- **owner**: Primary business owner (all permissions)
- **accountant**: Secondary user with limited modification rights
- **investor**: Capital layer only (read-only on most tables)
- **admin**: Headroom internal admin (bypasses RLS in controlled ways)

### Sessions

```sql
CREATE TABLE sessions (
  token VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

8-hour TTL. Tokens are opaque strings. Sessions are audited in `audit_log` for compliance.

---

## Financial Data Schema

### Bank Accounts & Connections

```sql
CREATE TYPE bank_connection_status AS ENUM ('pending', 'connected', 'disconnected', 'error');

CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL, 
    -- plaid, stripe, wave, quickbooks, xero, zoho, tally
  account_name VARCHAR(255),
  account_number VARCHAR(50),
  status bank_connection_status NOT NULL DEFAULT 'pending',
  access_token VARCHAR(500),
  refresh_token VARCHAR(500),
  expires_at TIMESTAMP,
  last_sync TIMESTAMP,
  sync_error VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Tokens are encrypted at rest in production (AWS Secrets Manager).

### Transactions

```sql
CREATE TYPE transaction_category AS ENUM (
  'revenue', 'operating_expense', 'capital_expense', 'payroll', 
  'loan_payment', 'tax', 'transfer', 'other'
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  description VARCHAR(500),
  category transaction_category,
  counterparty VARCHAR(255),
  is_recurring BOOLEAN DEFAULT FALSE,
  frequency VARCHAR(50), -- daily, weekly, monthly, quarterly, annual
  confidence_score DECIMAL(3, 2), -- 0-1 for recurring prediction
  source_id VARCHAR(255), -- External transaction ID (for dedup)
  raw_data JSONB, -- Original payload from provider
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_transactions_dedup ON transactions(tenant_id, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX idx_transactions_date_range ON transactions(tenant_id, date DESC);
```

**Categorization flow:**
1. All transactions imported with raw `description`
2. Category predicted via ML model + confidence score
3. User can override category; override is tracked in `audit_log`
4. Recurring logic: if same `counterparty` + similar amount in 2+ periods, flagged as recurring

---

## Forecasting Engine

### Forecasts

```sql
CREATE TABLE forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  base_model_version VARCHAR(50),
  days_forecasted INTEGER DEFAULT 90,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', 
    -- pending, complete, error
  model_error VARCHAR(500),
  metadata JSONB DEFAULT '{}'
);
```

### Forecast Datapoints

```sql
CREATE TABLE forecast_datapoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_id UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  best_case DECIMAL(15, 2),       -- p90 (optimistic)
  expected_case DECIMAL(15, 2),   -- p50 (median)
  downside_case DECIMAL(15, 2),   -- p10 (pessimistic)
  confidence_level DECIMAL(3, 2), -- 0-1
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (forecast_id, date)
);
```

**Every 30-day horizon includes:**
- Inflow predictions (from recurring revenue patterns)
- Outflow predictions (payroll, rent, software subscriptions)
- Confidence bands reflecting historical variance

### Forecast Scenarios

```sql
CREATE TABLE forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, 
    -- new_hire | contract | slow_month | loan | custom
  parameters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Example scenarios:**
```json
{
  "type": "new_hire",
  "name": "Hire 2 engineers @ $200K each",
  "parameters": { "salary": 200000, "count": 2, "start_date": "2024-06-01" }
}
```

---

## Credit Marketplace

### Credit Applications

```sql
CREATE TYPE credit_app_status AS ENUM (
  'draft', 'submitted', 'approved', 'rejected', 'funded', 'repaid'
);

CREATE TABLE credit_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status credit_app_status NOT NULL DEFAULT 'draft',
  requested_amount DECIMAL(15, 2),
  underwriting_score INTEGER CHECK (underwriting_score >= 0 AND underwriting_score <= 100),
  score_breakdown JSONB, -- signal-by-signal breakdown
  fraud_check_status VARCHAR(50) DEFAULT 'pending', -- pass | fail | review
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**score_breakdown example:**
```json
{
  "cash_flow_stability": 0.75,
  "revenue_growth": 0.68,
  "credit_history": 0.82,
  "bank_balance_health": 0.91,
  "debt_service_coverage": 0.55,
  "industry_risk": 0.70,
  "seasonality_risk": 0.60
}
```

### Credit Offers

```sql
CREATE TABLE credit_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_application_id UUID NOT NULL REFERENCES credit_applications(id) ON DELETE CASCADE,
  lender VARCHAR(255),
  amount DECIMAL(15, 2),
  interest_rate DECIMAL(5, 3),
  term_months INTEGER,
  monthly_payment DECIMAL(15, 2),
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Active Loans

```sql
CREATE TABLE credit_active_loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_offer_id UUID NOT NULL REFERENCES credit_offers(id),
  disbursed_amount DECIMAL(15, 2) NOT NULL,
  disbursed_at TIMESTAMP NOT NULL,
  total_repaid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'current', 
    -- current | paid_off | defaulted | in_review
  next_review_at TIMESTAMP,
  covenant_breach JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Capital Raising

```sql
CREATE TYPE capital_track AS ENUM ('rev_share', 'reg_cf', 'reg_a_plus');

CREATE TABLE capital_raises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  track capital_track NOT NULL,
  target_amount DECIMAL(15, 2),
  raised_amount DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', 
    -- draft, active, closed, funded
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE capital_investors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capital_raise_id UUID NOT NULL REFERENCES capital_raises(id) ON DELETE CASCADE,
  investor_email VARCHAR(255),
  investment_amount DECIMAL(15, 2),
  equity_percentage DECIMAL(5, 2),
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected, withdrawn
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Audit Log

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100), -- INSERT, UPDATE, DELETE, LOGIN, LOGOUT
  resource_type VARCHAR(100), -- transactions, credit_application, etc
  resource_id VARCHAR(255),
  changes JSONB, -- old vs new values
  ip_address VARCHAR(45),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Compliance:** All data changes are logged for SOC 2 / PCI DSS audit trails.

---

## Alerts & Insights

```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(100), 
    -- low_cash_warning, anomaly_detected, recurring_pattern_change
  severity VARCHAR(50), -- critical, high, medium, low
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500), -- Deep link to relevant section
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Alert triggers:**
- Cash forecast dips below $X for >N days
- Unusual transaction detected (amount/frequency outlier)
- Recurring pattern changed (payroll late, invoice timing shifted)

---

## Event Bus

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);
```

**Events flow:**
1. Transaction imported → `transaction.created` event
2. Forecast generated → `forecast.generated` event
3. Credit offer accepted → `credit.accepted` event
4. Event workers consume and trigger downstream actions (alerts, emails, etc.)

---

## Migrations & Development

All migrations live in `src/db/` with numbered prefixes:

```
001-schema.sql          # Initial full schema
01-rls-policies.sql     # RLS enforcement for security
```

Run on app startup:
```typescript
// src/db/init.ts
import schema from './schema.sql';
import rlsPolicies from './01-rls-policies.sql';

async function initSchema() {
  await db.query(schema);
  await db.query(rlsPolicies);
}
```

---

## RLS Context Variables

Every query must set the tenant context:

```typescript
// Middleware or request handler
import { pool } from './db';

async function withTenantContext(tenantId: string, callback: () => Promise<any>) {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_tenant_context($1::UUID)', [tenantId]);
    return await callback();
  } finally {
    client.release();
  }
}
```

---

## Performance Considerations

1. **Indexes on tenant_id + key fields** (date, status, etc.) for fast filtering
2. **Composite indexes** for common queries (tenant + date range)
3. **UNIQUE constraints** on (tenant_id + external_id) to prevent duplicates
4. **Materialized views** for aggregation queries (e.g., monthly revenue)
5. **Archive old forecasts** >6 months to cold storage (S3)

---

## Constraints & Validation

- Email validation regex enforced at table level
- Underwriting score 0-100 bounds
- Decimal precision (15,2) for all currency fields
- UUID for all IDs (no auto-increment)
- Soft deletes with `deleted_at` nullable timestamp column
