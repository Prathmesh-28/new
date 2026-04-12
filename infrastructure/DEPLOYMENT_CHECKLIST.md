# Deployment Checklist & Migration Guide

## Pre-Deployment Validation

### 1. Code Review Checklist

- [ ] All TypeScript files compile without errors
- [ ] No console.logs or debug code in production build
- [ ] Environment variables properly configured (no secrets in code)
- [ ] API client URLs point to correct backends
- [ ] Error handling in place for API failures
- [ ] Logging configured (CloudWatch, Datadog)

```bash
# Run pre-deployment checks
npm run type-check       # TypeScript validation
npm run lint            # Code style & issues
npm test               # Unit tests
npm run build          # Production build
```

### 2. Database Schema Validation

- [ ] All migrations executed successfully
- [ ] RLS policies enabled on all tenant-scoped tables
- [ ] Indexes created and analyzed
- [ ] Backup strategy in place
- [ ] Data archival strategy documented

```bash
# Validate schema
psql -h $DB_HOST -U $DB_USER -d headroom -c "\dt"
psql -h $DB_HOST -U $DB_USER -d headroom -c "\dp" # Check RLS policies
```

### 3. Infrastructure Readiness

- [ ] AWS VPC configured with proper security groups
- [ ] RDS database created with Multi-AZ enabled
- [ ] ElastiCache (Redis) cluster deployed
- [ ] S3 buckets created with encryption & lifecycle policies
- [ ] Secrets Manager populated with all credentials
- [ ] API Gateway deployed with custom domain
- [ ] CloudWatch/Datadog alarms configured
- [ ] Load balancer health checks passing

```bash
# Deploy infrastructure
cd infrastructure
terraform plan   # Review changes
terraform apply  # Deploy to AWS
```

### 4. Service Dependencies

- [ ] Forecast Service (Python/FastAPI) ready OR scheduled for Phase 2
- [ ] Credit Service (Node/Express) ready OR scheduled
- [ ] Capital Service (Node/Express) ready OR scheduled
- [ ] Bank sync workers (Plaid/QuickBooks) ready OR scheduled

---

## Deployment Phases

### Phase 1: Database Foundation (✅ Complete)

| Migration | File | Purpose | Status |
|-----------|------|---------|--------|
| Schema Setup | `schema.sql` | Core tables & structure | ✅ Done |
| RLS Policies | `01-rls-policies.sql` | Multi-tenant isolation | ✅ Done |
| Sample Data | `seed.sql` | Test data for dev | ✅ Done |

**Deployment steps:**
```bash
psql -h localhost -U postgres headroom < src/db/schema.sql
psql -h localhost -U postgres headroom < src/db/01-rls-policies.sql
psql -h localhost -U postgres headroom < src/db/seed.sql
```

**Validation:**
```sql
-- Verify all tables created
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public';

-- Should be 18 tables

-- Verify RLS enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables WHERE schemaname = 'public' 
ORDER BY tablename;

-- All tenant_scoped tables should show 't'
```

---

### Phase 2: Infrastructure Foundation (✅ Complete)

| Component | Terraform File | Purpose | Status |
|-----------|-----------------|---------|--------|
| VPC & Networking | `vpc.tf` | Isolated network | ✅ Done |
| RDS Database | `rds.tf` | PostgreSQL 16 | ✅ Done |
| ElastiCache (Redis) | `redis.tf` | Session cache | ✅ Done |
| S3 Buckets | `s3.tf` | Document storage | ✅ Done |
| Secrets Manager | `secret_manager.tf` | Credentials vault | ✅ Done |
| API Gateway | `api_gateway.tf` | REST API with domain | ✅ Done |
| Monitoring | `monitoring.tf` | CloudWatch + Datadog | ✅ Done |

**Deployment steps:**
```bash
cd infrastructure
export TF_VAR_environment=production
export TF_VAR_aws_region=us-east-1

terraform init
terraform plan  # Review all resources
terraform apply # Deploy (takes 15-20 min)
```

**Post-deployment verification:**
```bash
# List all created resources
aws ec2 describe-instances
aws rds describe-db-instances
aws elasticache describe-cache-clusters
aws s3 ls
aws secretsmanager list-secrets
aws apigateway get-rest-apis
```

---

### Phase 3: Frontend Deployment (✅ Complete)

| Component | File | Purpose | Status |
|-----------|------|---------|--------|
| Next.js App | `src/app/` | React SPA | ✅ Done |
| API Client | `src/lib/api.ts` | Backend integration | ✅ Done |
| Admin Dashboard | `src/app/admin/` | Operations portal | ✅ Done |
| Static Site | `src/app/(site)/` | Marketing pages | ✅ Done |

**Deployment steps:**
```bash
# Build production bundle
npm run build

# Upload to CDN / ECS container registry
docker build -t headroom-frontend:latest .
docker push $ECR_REGISTRY/headroom-frontend:latest

# Deploy new task definition
aws ecs update-service \
  --cluster headroom-prod \
  --service headroom-frontend \
  --force-new-deployment
```

**Pre-launch verification:**
```bash
# Test frontend locally
npm run dev

# Navigate to:
# - http://localhost:3000/                (marketing site)
# - http://localhost:3000/admin/login     (admin portal)
# - http://localhost:3000/admin/dashboard (should redirect if not authed)

# Check API client connectivity
curl $NEXT_PUBLIC_API_GATEWAY_URL/health  # Should respond
```

---

### Phase 4: Backend Services (⏳ Pending)

| Service | Tech Stack | Purpose | Status |
|---------|-----------|---------|--------|
| Forecast | Python/FastAPI | 90-day projections | ⏳ To build |
| Credit | Node/Express | Underwriting & offers | ⏳ To build |
| Capital | Node/Express | Fundraising platform | ⏳ To build |

**Deployment steps (when ready):**
```bash
# Each service follows same pattern:
# 1. Build & push Docker image
# 2. Create/update ECS task definition
# 3. Deploy to Fargate cluster
# 4. Run health checks

./scripts/deploy-service.sh forecast production
./scripts/deploy-service.sh credit production
./scripts/deploy-service.sh capital production
```

**Health check endpoints:**
```bash
curl https://api.headroom.app/forecast/health  # Forecast service
curl https://api.headroom.app/credit/health     # Credit service
curl https://api.headroom.app/capital/health    # Capital service
```

---

### Phase 5: Data Integration (⏳ Pending)

| Integration | Provider | Status |
|-------------|----------|--------|
| Bank accounts | Plaid | ⏳ To implement |
| Invoice accounting | QuickBooks | ⏳ To implement |
| General accounting | Xero | ⏳ To implement |
| P&L data | Zoho | ⏳ To implement |
| Accounting software | Tally | ⏳ To implement |

**Deployment steps (when ready):**
```bash
# Deploy sync workers
aws ecs create-service \
  --cluster headroom-prod \
  --service-name headroom-sync-workers \
  --task-definition headroom-sync-workers:1 \
  --desired-count 2

# Configure scheduled tasks (EventBridge)
# - Transaction reconciliation: every 6 hours
# - Forecast generation: daily at 2 AM UTC
# - Stale record cleanup: weekly
```

---

## Rollback Procedures

### Database Rollback

**If schema migration fails:**

```bash
# 1. Identify problematic migration
# 2. Create a fix SQL file
# 3. Revert manually (example for dropped column):

psql -h $DB_HOST -U $DB_USER headroom << EOF
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50);
EOF

# 4. Run new migration
psql -h $DB_HOST -U $DB_USER headroom < src/db/02-fix-schema.sql
```

**If RLS causes permission issues:**

```sql
-- Temporarily disable RLS to restore functionality
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Debug and fix RLS policies
SELECT * FROM pg_policies;

-- Re-enable once fixed
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
```

---

### Infrastructure Rollback

**If Terraform deployment fails:**

```bash
# Revert to previous state
terraform destroy -target="aws_instance.failed_resource"

# Or completely roll back
terraform apply -var="desired_count=0"  # Scale down services
git checkout HEAD~1                      # Previous version
terraform apply                          # Revert
```

**If ECS service fails:**

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster headroom-prod \
  --service headroom-frontend \
  --task-definition headroom-frontend:$PREVIOUS_REVISION
```

---

## Monitoring Post-Deployment

### Health Checks

```bash
# API Gateway
curl -i https://api.headroom.app/health

# RDS Database
aws rds describe-db-instances \
  --db-instance-identifier headroom-prod-db \
  --query 'DBInstances[0].DBInstanceStatus'

# ElastiCache
aws elasticache describe-cache-clusters \
  --cache-cluster-id headroom-redis \
  --query 'CacheClusters[0].CacheClusterStatus'

# ECS Services
aws ecs describe-services \
  --cluster headroom-prod \
  --services headroom-frontend
```

### Critical Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| API Gateway 5xx Error Rate | > 1% | Page on-call |
| RDS CPU Utilization | > 80% | Scale up instance |
| RDS Storage | > 80% | Archive old data |
| ElastiCache Eviction Rate | > 100/sec | Increase node size |
| ECS Task Memory | > 90% | Increase task memory |
| API Latency (p99) | > 2 seconds | Optimize slow queries |

### CloudWatch Dashboard Queries

```bash
# Create monitoring dashboard
aws cloudwatch put-dashboard \
  --dashboard-name Headroom-Production \
  --dashboard-body file://monitoring/dashboard.json
```

---

## Troubleshooting Checklist

### Frontend Not Loading

- [ ] Check NEXT_PUBLIC_API_GATEWAY_URL environment variable
- [ ] Verify API Gateway is receiving requests: `aws apigateway get-stage-logs`
- [ ] Check ECS service task logs: `aws logs get-log-events --log-group-name /ecs/headroom-frontend`
- [ ] Verify CORS headers on API Gateway

### API Calls Failing

- [ ] Check API Gateway health: `curl https://api.headroom.app/health`
- [ ] Verify RDS connectivity from ECS tasks
- [ ] Check Secrets Manager for missing credentials: `aws secretsmanager get-secret-value`
- [ ] Review service container logs for errors

### Database Performance Degrading

- [ ] Check RDS slow query log: `mysql> SELECT * FROM mysql.slow_log;`
- [ ] Analyze query plans: `EXPLAIN ANALYZE SELECT ...`
- [ ] Identify missing indexes: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;`
- [ ] Monitor transaction locks: `SELECT * FROM pg_locks;`

### Multi-tenant Isolation Broken

- [ ] Verify RLS policies active: `SELECT schemaname, tablename, * FROM pg_policies;`
- [ ] Check `app.current_tenant_id` set correctly: `SELECT current_setting('app.current_tenant_id');`
- [ ] Review audit_log for suspicious queries: `SELECT * FROM audit_log WHERE action = 'SELECT' AND table_name = 'transactions';`
- [ ] Check application code for missing `set_tenant_context()` calls

---

## Post-Deployment Verification

Run this script after every deployment:

```bash
#!/bin/bash
set -e

echo "🔍 Running post-deployment verification..."

# 1. API Gateway health
echo "  → API Gateway health..."
curl -f https://api.headroom.app/health || exit 1

# 2. Database connectivity
echo "  → Database connectivity..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tenants;" || exit 1

# 3. Sample forecast query (with RLS)
echo "  → RLS enforcement..."
psql "$DATABASE_URL" -c "SELECT set_tenant_context('00000000-0000-0000-0000-000000000001'::UUID); SELECT COUNT(*) FROM forecasts;" || exit 1

# 4. Frontend accessibility
echo "  → Frontend accessibility..."
curl -f https://headroom.app/ | grep -q "<title>" || exit 1

# 5. Admin dashboard
echo "  → Admin dashboard..."
curl -f https://headroom.app/admin/login | grep -q "email" || exit 1

echo "✅ All checks passed!"
```

---

## Timeline Estimate

| Phase | Tasks | Timeline | Blockers |
|-------|-------|----------|----------|
| 1 | Database schema + RLS | **✅ Complete** | None |
| 2 | AWS infrastructure | **✅ Complete** | None |
| 3 | Frontend deployment | **✅ Complete** | None |
| 4 | Backend services | 2-4 weeks | Dev team |
| 5 | Data integrations | 3-6 weeks | API keys, testing |
| 6 | QA + security audit | 2-3 weeks | Testing resources |
| 7 | Beta launch | 1 week | Launch planning |

---

## Sign-Off

- [ ] Tech Lead: Reviewed and approved deployment plan
- [ ] DevOps: Infrastructure tested and validated
- [ ] Security: RLS policies and encryption verified
- [ ] QA: Acceptance tests passing on staging
- [ ] Product: Feature complete and ready for launch

**Deployment Owner:** _______________  
**Date:** _______________  
**Version:** 1.0 (Initial Production)
