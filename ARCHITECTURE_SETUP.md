# Headroom Production Architecture Setup Guide

## Database Setup

### Prerequisites
- PostgreSQL 16+ (or use Docker Compose)
- Redis 7+ (for caching)
- Node.js 20+

### Quick Start with Docker

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify connections
psql -h localhost -U postgres -d headroom -c "\dt"
redis-cli ping
```

### Environment Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your database credentials:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=headroom
DB_USER=postgres
DB_PASSWORD=postgres

# Application
NODE_ENV=development
SESSION_SECRET=your-super-secret-key
```

## Multi-Tenant Architecture

The system supports three user roles:
- **Owner**: SMB business owner (primary user)
- **Accountant**: Secondary user with limited access
- **Investor**: Capital layer only (tertiary user)
- **Admin**: Internal admin for multi-tenant management

## Authentication Flow

1. User logs in via `/admin/login` with email + password
2. Credentials verified against `users` table
3. Session token created in `sessions` table (8-hour TTL)
4. Session cookie stored (`hr_admin_session`, httpOnly)
5. Edge middleware validates cookie presence
6. Server validation checks database session + expiry

## Database Schema

### Core Tables

- **tenants**: Multi-tenant isolation (name, subscription_tier, features)
- **users**: All users across tenants (email, role, status)
- **sessions**: Active session tokens with expiry
- **bank_connections**: Connected bank accounts per tenant
- **transactions**: Normalized transaction data
- **forecasts**: 90-day cash flow forecasts
- **alerts**: Alerts and insights per tenant
- **credit_applications**: Credit marketplace applications
- **capital_raises**: Capital raise campaigns
- **audit_log**: Comprehensive audit trail

### Default Credentials

Development environment includes seeded users:

```
Tenant: demo-tenant
Users:
  - admin@headroom.local / headroom@2024 (role: admin)
  - owner@headroom.local / headroom@2024 (role: owner)
  - accountant@headroom.local / headroom@2024 (role: accountant)
```

## API Authentication

All API endpoints (except `/api/admin/login`) require a valid session cookie.

### Login Endpoint

```bash
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@headroom.local",
  "password": "headroom@2024"
}

# Response
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@headroom.local",
    "role": "admin",
    "tenant_id": "uuid"
  }
}
```

### Logout Endpoint

```bash
POST /api/admin/logout
Cookie: hr_admin_session=...

# Response
{
  "success": true
}
```

## Deployment to AWS

### Services Architecture

```
┌─── Client Layer ─────────────────────┐
│  React SPA (Vercel)                  │
│  React Native (App Store/Play)       │
└─────────────────────────────────────┘
           ↓
┌─── API Gateway ──────────────────────┐
│  REST + GraphQL (AWS API Gateway)    │
│  Auth, Rate Limiting, CORS            │
└─────────────────────────────────────┘
           ↓
┌─── Service Tier ─────────────────────┐
│  ├─ Forecast Service (Python/ECS)   │
│  ├─ Credit Service (Node/ECS)        │
│  └─ Capital Service (Node/ECS)       │
└─────────────────────────────────────┘
           ↓
┌─── Data Layer ───────────────────────┐
│  ├─ PostgreSQL (AWS RDS Multi-AZ)   │
│  ├─ Redis (AWS ElastiCache)          │
│  └─ S3 (Documents/Exports)           │
└─────────────────────────────────────┘
```

### Environment Variables for AWS

```env
# Database (RDS)
DB_HOST=headroom-postgres.cnxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false

# Redis (ElastiCache)
REDIS_HOST=headroom-elasticache.cnxxx.ng.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=...

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Observability
DATADOG_API_KEY=...
PAGERDUTY_API_KEY=...
```

## Project Status: ✅ Core Complete + Ready for Services

### Phase Completion Summary

| Phase | Status | Start | End | Notes |
|-------|--------|-------|-----|-------|
| **1: Database Foundation** | ✅ Complete | Week 1 | Week 2 | Multi-tenant schema, authentication, RLS policies |
| **2: Forecast Service** | ⏳ Pending | TBD | TBD | Python/FastAPI with 90-day projections |
| **3: AWS Infrastructure** | ✅ Complete | Week 3 | Week 4 | VPC, RDS, ElastiCache, S3, API Gateway, monitoring |
| **4: Frontend Rebuild** | ✅ Complete | Week 5 | Week 6 | React SPA with API client, admin dashboard, real data |
| **5: Credit Service** | ⏳ Pending | TBD | TBD | Node/Express with underwriting, offers, scoring |
| **6: Capital Service** | ⏳ Pending | TBD | TBD | Node/Express with 3-track fundraising (revenue/Reg CF/Reg A+) |
| **7: Data Integration** | ⏳ Pending | TBD | TBD | Plaid, QuickBooks, Xero, Zoho, Tally connectors |
| **8: Launch Readiness** | ⏳ Pending | TBD | TBD | QA, security audit, beta testing |

### What's Ready Now

✅ **Database Layer**
- 18 core tables for multi-tenancy, forecasting, credit, capital raising
- Row-level security (RLS) policies on all tenant-scoped tables
- Comprehensive migrations in `src/db/schema.sql` and `src/db/01-rls-policies.sql`
- All SQL verified against PostgreSQL 16

✅ **Infrastructure Layer**
- AWS infrastructure fully defined as Terraform code
- VPC with proper subnetting and security groups
- RDS PostgreSQL with Multi-AZ failover
- ElastiCache Redis for session management
- S3 with encryption, versioning, lifecycle policies
- API Gateway with custom domain and API key support
- CloudWatch/Datadog monitoring with SNS alarms
- Terraform validated with no errors

✅ **Frontend Layer**
- Next.js 14 React SPA fully migrated
- API client library in `src/lib/api.ts` with all service endpoints
- Admin dashboard connected to backend services
- Session-based authentication with 8-hour TTL
- Environment-based configuration for multi-environment deployment
- Pre-built marketing pages and admin portal

### What's Pending

⏳ **Service Implementation** (2-4 weeks each)
- Forecast Service: 90-day cash flow projections with ML confidence bands
- Credit Service: Silent underwriting and multi-lender offer matching
- Capital Service: Three-track fundraising (revenue-share, Reg CF, Reg A+)

⏳ **Data Integration** (3-6 weeks)
- Bank data sync (Plaid)
- Accounting integrations (QuickBooks, Xero, Zoho, Tally)
- Recurring transaction detection
- Category auto-classification

---

## Documentation Roadmap

### For Developers

📖 [**DATABASE_SETUP.md**](./infrastructure/DATABASE_SETUP.md)
- Local development with Docker
- Schema initialization & migrations
- Working with RLS in code
- Common queries and patterns
- Performance tuning & indexing
- Troubleshooting guide

📖 [**DATABASE_ARCHITECTURE.md**](./infrastructure/DATABASE_ARCHITECTURE.md)
- Multi-tenancy strategy & rationale
- Complete schema definitions with explanations
- 18 core tables: tenants, users, financial data, forecasts, credit, capital
- RLS enforcement mechanics
- Data integrity constraints & design decisions
- Real-world examples and use cases

📖 [**DEPLOYMENT_CHECKLIST.md**](./infrastructure/DEPLOYMENT_CHECKLIST.md)
- Pre-deployment validation steps
- 5-phase deployment walkthrough
- Infrastructure validation commands
- Rollback procedures for code & infrastructure
- Post-deployment monitoring metrics
- Troubleshooting by symptom (API failing, DB slow, RLS broken, etc.)
- Critical metrics and thresholds

### For DevOps

📁 **Terraform Configuration** (`infrastructure/terraform/`)
- `main.tf` - AWS provider and region setup
- `vpc.tf` - VPC, subnets, security groups
- `rds.tf` - PostgreSQL database cluster
- `redis.tf` - ElastiCache Redis instance
- `s3.tf` - S3 buckets with encryption and lifecycle
- `secret_manager.tf` - AWS Secrets Manager for credentials
- `api_gateway.tf` - REST API with custom domain
- `monitoring.tf` - CloudWatch alarms and SNS/Datadog integration

### For Operators

✅ **Environment Variables** (`.env.example`)
- Database connection parameters
- API Gateway URL
- Service endpoint URLs
- AWS credentials and configuration
- Monitoring and alerting settings

✅ **Database Seeds** (`src/db/seed.sql`)
- Default tenant (demo-tenant)
- Three seeded users (admin, owner, accountant)
- Sample forecast, credit application, and capital raise data
- Audit log entries

---

## Database Migrations

### Current Migrations in `src/db/`

```
schema.sql              - Initial 18-table schema with constraints
01-rls-policies.sql    - Row-level security policies for all tables
seed.sql              - Test data for development
```

### Adding New Migrations

Follow naming convention: `NN-description.sql` (e.g., `02-add-feature-x.sql`)

```sql
-- Always follow these patterns:

-- 1. New tables
CREATE TABLE IF NOT EXISTS new_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Modify existing structure
ALTER TABLE IF EXISTS transactions 
ADD COLUMN IF NOT EXISTS new_field VARCHAR(255);

-- 3. Add indexes
CREATE INDEX IF NOT EXISTS idx_txn_category 
ON transactions(category) WHERE deleted_at IS NULL;

-- 4. Update RLS (if new table)
CREATE POLICY new_feature_isolation ON new_feature 
USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Running Migrations

```bash
# Local development
npm run db:init          # All migrations in sequence

# Production (AWS RDS)
aws ssm start-session --target <EC2_INSTANCE> # Connect to bastion host
psql -h $DB_HOST -U $DB_USER headroom < src/db/02-new-migration.sql
```

---

## Next Steps to Production

### Immediate (Week 7-8)

1. **Build Forecast Service** (Python/FastAPI)
   - Data ingestion from `transactions` table
   - 90-day projection algorithm with ML confidence bands
   - Alert system for cash pressure scenarios
   - Demo API endpoint

2. **Deploy Infrastructure to Staging**
   - Run Terraform with `environment=staging`
   - Validate all AWS resources created
   - Test database connectivity and RLS policies
   - Load test API Gateway

3. **Run Security Audit**
   - Review RLS policies for gaps
   - Audit Secrets Manager access
   - Validate SSL/TLS configuration
   - Check for SQL injection vulnerabilities

### Phase 2 (Week 9-10)

4. **Build Credit Service** (Node/Express)
   - Silent underwriting score calculation
   - Multi-lender offer matching
   - Repayment simulation
   - API endpoints

5. **Implement Bank Data Sync** (Plaid)
   - OAuth connection flow
   - Transaction sync worker
   - Category classification
   - Reconciliation layer

### Phase 3 (Week 11-12)

6. **Build Capital Service** (Node/Express)
   - Three-track campaign management
   - Investor portal
   - Compliance tracking
   - Term sheet generation

7. **Go-Live Preparation**
   - Load testing
   - Backup/restore procedures
   - Incident response runbooks
   - Documentation for support team

---

## Support & Troubleshooting

See [DEPLOYMENT_CHECKLIST.md](./infrastructure/DEPLOYMENT_CHECKLIST.md#troubleshooting-checklist) for:
- Frontend not loading
- API calls failing
- Database performance degrading
- Multi-tenant isolation broken
- MySQL/PostgreSQL common issues

Migrations run automatically on application startup via `initSchema()`.
