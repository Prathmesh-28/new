# Developer Quick Reference Card

## 🚀 Getting Started (5 minutes)

### 1. Clone & Install
```bash
git clone <repo> headroom && cd headroom
npm install
cp .env.example .env.local
```

### 2. Start Local Dev (Docker)
```bash
docker-compose up -d
npm run db:init
npm run dev
```

### 3. Login & Test
- UI: http://localhost:3000/admin/login
- Credentials: `admin@headroom.local` / `headroom@2024`
- API: http://localhost:3000/api/admin/session

---

## 📊 Database at a Glance

### Quick Schema View
```
tenants (multi-tenancy root)
├── users (auth layer)
│   └── sessions (active logins)
├── bank_connections & transactions (financial data)
├── forecasts & forecast_datapoints (90-day projections)
├── credit_applications & credit_offers (lending)
├── capital_raises & capital_investors (fundraising)
└── audit_log (compliance trail)
```

### RLS Context (Critical!)
```typescript
// ALWAYS set tenant context before queries
await client.query('SELECT set_tenant_context($1::UUID)', [tenantId]);
// All subsequent queries automatically filtered by tenant_id
```

### Sample Query
```sql
SELECT set_tenant_context('550e8400-e29b-41d4-a716-446655440000'::UUID);
SELECT SUM(amount) as total FROM transactions WHERE date > NOW() - INTERVAL 30 DAY;
-- Result is for that tenant only (RLS enforced)
```

---

## 🔐 Authentication

### Session-Based (httpOnly Cookies)
```
POST /api/admin/login
→ Returns user object
→ Sets hr_admin_session cookie (8-hour TTL)
→ All subsequent requests include cookie automatically
```

### Verify Session
```bash
curl -b "hr_admin_session=$TOKEN" http://localhost:3000/api/admin/session
```

### Logout
```bash
POST /api/admin/logout
```

---

## 🔧 API Client Usage

### Import & Use
```typescript
import { forecastApi, creditApi, capitalApi, adminApi } from '@/lib/api';

// Forecast
const forecast = await forecastApi.getForecast(tenantId);

// Credit  
const apps = await creditApi.getApplications(tenantId);
const offers = await creditApi.getOffers(tenantId);

// Capital
const raises = await capitalApi.getRaises(tenantId);

// Bank
const connections = await bankApi.getConnections(tenantId);
```

### Custom Requests
```typescript
const response = await fetch(
  `${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/forecast/alerts?tenant_id=${tenantId}`,
  {
    method: 'GET',
    credentials: 'include', // Include cookies
  }
);
```

---

## 📂 Key Files & Directories

| Path | Purpose |
|------|---------|
| `src/db/schema.sql` | 18 core tables |
| `src/db/01-rls-policies.sql` | Tenant isolation rules |
| `src/lib/api.ts` | API client library |
| `src/app/admin/AdminDashboard.tsx` | Main dashboard UI |
| `.env.example` | Configuration template |
| `infrastructure/terraform/` | AWS IaC (Terraform) |
| `infrastructure/DATABASE_ARCHITECTURE.md` | 📖 Database design |
| `infrastructure/DATABASE_SETUP.md` | 📖 Dev guide |
| `infrastructure/API_REFERENCE.md` | 📖 All endpoints |
| `infrastructure/DEPLOYMENT_CHECKLIST.md` | 📖 Launch guide |

---

## 🔍 Common Tasks

### Check Database Connection
```bash
psql -h localhost -U postgres -d headroom -c "\dt"
```

### View RLS Policies
```bash
psql -h localhost -U postgres -d headroom -c "\dp"
```

### Create Database Backup
```bash
pg_dump -h localhost -U postgres headroom > backup.sql
```

### Run Migrations
```bash
psql -h localhost -U postgres headroom < src/db/02-new-migration.sql
```

### Debug API Client
```typescript
// Add to src/lib/api.ts for logging
const response = await fetch(url, options);
console.log('Request:', url, options);
console.log('Response:', response.status, await response.json());
```

### Test RLS Isolation
```sql
-- Set to tenant A
SELECT set_tenant_context('tenant-a-uuid'::UUID);
SELECT COUNT(*) FROM transactions; -- Should see tenant A data only

-- Set to tenant B
SELECT set_tenant_context('tenant-b-uuid'::UUID);
SELECT COUNT(*) FROM transactions; -- Should see tenant B data only
```

---

## ⚠️ Common Pitfalls

### ❌ Forgot Tenant Context
```typescript
// WRONG - queries won't filter by tenant
await db.query('SELECT * FROM transactions');

// RIGHT - queries automatically filter
await db.query('SELECT set_tenant_context($1::UUID)', [tenantId]);
await db.query('SELECT * FROM transactions');
```

### ❌ Session Expired
```
Error: "Session expired or invalid"
→ User needs to log in again
→ POST /api/admin/login
```

### ❌ Missing Environment Variable
```
Error: "Cannot reach API Gateway"
→ Check NEXT_PUBLIC_API_GATEWAY_URL in .env.local
→ Should be http://localhost:3000 for local dev
→ Should be https://api.headroom.app for production
```

### ❌ RLS Blocking Insert
```
Error: "new row violates row-level security policy"
→ Ensure tenant_id in INSERT matches current context
→ Or explicitly set context: SELECT set_tenant_context($1);
```

### ❌ Database Connection Timeout
```
Error: "connect ECONNREFUSED 127.0.0.1:5432"
→ Docker containers running? docker-compose ps
→ PostgreSQL port 5432 exposed? docker-compose logs db
```

---

## 📈 Service Layer (Pending)

### What's Built ✅
- Database schema (18 tables)
- RLS policies (tenant isolation)
- Frontend (React SPA)
- API Gateway (custom domain)
- Terraform infrastructure

### What's Pending ⏳
1. **Forecast Service** (Python/FastAPI) - 2-4 weeks
   - Read transactions
   - Generate 90-day projections (p10/p50/p90)
   - Create alerts for cash pressure

2. **Credit Service** (Node/Express) - 2-4 weeks
   - Score applications
   - Match lenders
   - Create offers

3. **Capital Service** (Node/Express) - 2-4 weeks
   - Manage campaigns
   - Track investors
   - Generate term sheets

4. **Data Sync Workers** - 3-6 weeks
   - Plaid (bank accounts)
   - QuickBooks, Xero, Zoho, Tally (accounting)

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `DATABASE_ARCHITECTURE.md` | Why we built it this way (multi-tenant strategy, RLS) |
| `DATABASE_SETUP.md` | How to work with the database (queries, migrations, RLS) |
| `API_REFERENCE.md` | All API endpoints with examples |
| `DEPLOYMENT_CHECKLIST.md` | How to deploy (staging, prod, rollbacks) |
| `ARCHITECTURE_SETUP.md` | Project overview & status (this is the index) |

**→ Start with `ARCHITECTURE_SETUP.md`, then dive into specific docs**

---

## 🛠 Shell Aliases (Optional)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Headroom dev shortcuts
alias hr-db="psql -h localhost -U postgres headroom"
alias hr-init="npm run db:init"
alias hr-dev="npm run dev"
alias hr-build="npm run build"
alias hr-logs="docker-compose logs -f"

# Quick test commands
alias hr-test-auth='curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d "{\"email\":\"admin@headroom.local\",\"password\":\"headroom@2024\"}"'

alias hr-test-forecast='curl http://localhost:3000/api/admin/session -b "hr_admin_session=$SESSION_TOKEN"'
```

---

## 🆘 Help & Support

### Stuck? Checklist:

1. **Frontend not loading?**
   - Check `.env.local` has NEXT_PUBLIC_API_GATEWAY_URL
   - Run `npm run build` to verify TypeScript compiles
   - Check browser console (F12) for errors

2. **API calls failing?**
   - Check session cookie: `document.cookie` in browser console
   - Verify tenant_id is a valid UUID
   - Check network tab (F12) for actual error response

3. **Database issues?**
   - `docker-compose logs db` to see PostgreSQL errors
   - `hr-db` to connect directly and test queries
   - Check that RLS context is set: `SELECT current_setting('app.current_tenant_id');`

4. **Service not running?**
   - `docker-compose ps` to check container status
   - `docker-compose up -d` to restart
   - `docker-compose logs <service>` for error logs

5. **Environment setup?**
   - Copy `.env.example` to `.env.local`
   - Update DB credentials if using non-defaults
   - Restart dev server: Stop with Ctrl+C, run `npm run dev` again

### Need More Help?
- See `infrastructure/DEPLOYMENT_CHECKLIST.md` → Troubleshooting section
- See `infrastructure/DATABASE_SETUP.md` → Troubleshooting section
- Check GitHub Issues (if applicable)
- Ask in Slack #headroom-dev

---

## 🚀 Next Steps

### Today
- [ ] Clone repo and run `npm install`
- [ ] Start Docker: `docker-compose up -d`
- [ ] Initialize DB: `npm run db:init`
- [ ] Log in: http://localhost:3000/admin/login
- [ ] Verify dashboard loads with test data

### This Week
- [ ] Read `DATABASE_ARCHITECTURE.md` (understand schema)
- [ ] Read `API_REFERENCE.md` (know available endpoints)
- [ ] Try a few API calls from curl/Postman
- [ ] Explore admin dashboard UI

### Next Week
- [ ] Begin building Forecast Service (or assigned service)
- [ ] Follow `DATABASE_SETUP.md` for database work
- [ ] Commit code and create PR
- [ ] Use `DEPLOYMENT_CHECKLIST.md` for QA

---

## 📋 Quick Syntax Reference

### PostgreSQL RLS
```sql
-- Set tenant context
SELECT set_tenant_context('uuid-here'::UUID);

-- All queries now filtered
SELECT * FROM transactions;  -- RLS enforces tenant_id filter

-- Verify context
SELECT current_setting('app.current_tenant_id');

-- Clear context (end of transaction)
DISCARD PLANS;
```

### TypeScript API Calls
```typescript
// From src/lib/api.ts pattern
const apiCall = async (endpoint: string, method = 'GET', body?: any) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_GATEWAY_URL}${endpoint}`,
    {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
};

// Usage
const forecast = await apiCall('/forecast/forecast?tenant_id=...');
```

### Docker Commands
```bash
docker-compose up -d           # Start all services
docker-compose down            # Stop all services
docker-compose logs -f db      # Watch PostgreSQL logs
docker-compose logs -f redis   # Watch Redis logs
docker-compose ps              # See running containers
docker exec -it headroom_db psql -U postgres headroom  # Connect to DB
```

---

**Version:** 1.0  
**Last Updated:** 2024-01-15  
**Next Review:** After Phase 2 (Forecast Service) completion
