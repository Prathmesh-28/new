# Headroom Developer Quick Reference

## 🚀 Quick Start (5 minutes)

```bash
# 1. Start database and cache
docker-compose up -d

# 2. Initialize environment and database
bash scripts/init-dev-env.sh

# 3. Start development server
npm run dev

# 4. Open browser
open http://localhost:3000

# Demo login:
# Email: admin@headroom.local
# Password: headroom@2024
```

## 📁 Important Files

### Configuration
- `.env.local` - Environment variables (create from .env.example)
- `docker-compose.yml` - PostgreSQL + Redis setup
- `package.json` - Dependencies and scripts

### Database
- `src/db/schema.sql` - Multi-tenant database schema
- `src/db/seed.sql` - Demo data and default users
- `src/lib/db.ts` - PostgreSQL connection pool

### Authentication
- `src/lib/auth.ts` - Auth functions (async)
- `src/app/api/admin/login/route.ts` - Login endpoint
- `src/app/api/admin/logout/route.ts` - Logout endpoint
- `src/middleware.ts` - Edge middleware (cookie check)

### Documentation
- `README.md` - Project overview
- `PRODUCTION_ARCHITECTURE.md` - Full architecture
- `ARCHITECTURE_SETUP.md` - Setup guide
- `COMPLETION_CHECKLIST.md` - Progress tracker

## 🗄️ Database Info

**Connection String:**
```
postgres://postgres:postgres@localhost:5432/headroom
```

**Common Commands:**
```bash
# Connect to database
psql -h localhost -U postgres -d headroom

# List tables
\dt

# Describe users table
\d users

# View all sessions
SELECT * FROM sessions;

# Reset database (careful!)
psql -h localhost -U postgres -d headroom < src/db/schema.sql
psql -h localhost -U postgres -d headroom < src/db/seed.sql
```

## 👥 Demo Users

```
Tenant: demo-tenant (ID: auto-generated UUID)

Admin User:
  Email: admin@headroom.local
  Password: headroom@2024
  Role: admin

Owner User:
  Email: owner@headroom.local
  Password: headroom@2024
  Role: owner

Accountant User:
  Email: accountant@headroom.local
  Password: headroom@2024
  Role: accountant
```

## 🔑 API Endpoints

### Authentication

**POST /api/admin/login**
```json
{
  "email": "admin@headroom.local",
  "password": "headroom@2024"
}
```

Response:
```json
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

**POST /api/admin/logout**
- Returns: `{ "success": true }`

## 🧪 Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Integration tests (with database)
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## 📊 Environment Variables

Required locally (defaults work with docker-compose):

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=headroom
DB_USER=postgres
DB_PASSWORD=postgres

# Node environment
NODE_ENV=development

# Session
SESSION_SECRET=your-secret-here
```

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js pages and routes
│   ├── (site)/            # Public site routes
│   ├── admin/             # Admin panel (protected)
│   ├── api/               # API endpoints
│   │   └── admin/
│   │       ├── login/
│   │       └── logout/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/            # React components
├── lib/                   # Utilities
│   ├── auth.ts           # Authentication
│   └── db.ts             # PostgreSQL client
├── db/                   # Database files
│   ├── schema.sql        # Multi-tenant schema
│   └── seed.sql          # Demo data
└── middleware.ts         # Edge middleware

infrastructure/           # AWS/Terraform (future)
services/                # Microservices (future)
```

## 🔄 Authentication Flow

```
┌─ User ────────────────────────┐
│ Email: admin@headroom.local   │
│ Password: headroom@2024       │
└───────────┬────────────────────┘
            ↓
    POST /api/admin/login
            ↓
    ┌─ Verify Credentials ───────┐
    │ SELECT * FROM users        │
    │ WHERE email = ?            │
    │ AND status = 'active'      │
    └───────────┬────────────────┘
                ↓
    ┌─ Hash Password ────────────┐
    │ bcrypt.compare()           │
    └───────────┬────────────────┘
                ↓
    ┌─ Create Session ───────────┐
    │ INSERT INTO sessions       │
    │ token, user_id, tenant_id  │
    │ expires_at = NOW() + 8h    │
    └───────────┬────────────────┘
                ↓
    ┌─ Set Cookie ───────────────┐
    │ hr_admin_session           │
    │ httpOnly, sameSite, secure │
    └───────────┬────────────────┘
                ↓
    ┌─ Return User ──────────────┐
    │ { success: true, user }    │
    └────────────────────────────┘
```

## 🎯 Common Tasks

### Add a New User

```sql
INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
VALUES (
  '89b5a5f0-...',  -- tenant_id from demo-tenant
  'newuser@headroom.local',
  crypt('newpassword', gen_salt('bf')),
  'New User',
  'accountant',  -- owner, accountant, investor, admin
  'active'
);
```

### Create a New Tenant

```sql
INSERT INTO tenants (name, company_name, subscription_tier, status, features)
VALUES (
  'company-unique-name',
  'Company Full Name',
  'growth',  -- starter, growth, pro, capital
  'active',
  '{
    "has_forecasting": true,
    "has_credit": true,
    "has_capital": true
  }'::jsonb
);
```

### Check Active Sessions

```sql
SELECT s.token, s.expires_at, u.email, t.name as tenant_name
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN tenants t ON s.tenant_id = t.id
WHERE s.expires_at > NOW()
ORDER BY s.created_at DESC;
```

### View Audit Log

```sql
SELECT timestamp, action, resource_type, changes::text
FROM audit_log
WHERE tenant_id = 'tenant-uuid'
ORDER BY timestamp DESC
LIMIT 10;
```

## 🐛 Debugging

### Check database connection

```bash
psql -h localhost -U postgres -d headroom -c "SELECT 1;"
```

### Check Redis connection

```bash
redis-cli -h localhost ping
# Should return: PONG
```

### View logs

```bash
# Next.js logs
npm run dev

# Docker logs
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Reset Everything

```bash
# Stop containers
docker-compose down -v

# Remove local database
rm -rf node_modules .next

# Start fresh
docker-compose up -d
npm install
bash scripts/init-dev-env.sh
npm run dev
```

## 📞 Getting Help

- **Architecture Questions**: See `PRODUCTION_ARCHITECTURE.md`
- **Setup Issues**: See `ARCHITECTURE_SETUP.md`
- **Progress Tracking**: See `COMPLETION_CHECKLIST.md`
- **Service Details**: See `services/*.md`
- **Code**: Check inline comments in source files

## 🚀 Next Phase

When Phase 2 (services) begins:

1. **Forecast Service** (Python)
   - Start: `services/forecast-service/`
   - Reads: `transactions` table
   - Writes: `forecasts` table

2. **Credit Service** (Node.js)
   - Start: `services/credit-service/`
   - Reads: `forecasts` table
   - Writes: `credit_applications` table

3. **Capital Service** (Node.js)
   - Start: `services/capital-service/`
   - Reads: `users` table
   - Writes: `capital_raises` table

## ✅ Pre-Commit Checklist

Before committing code:

- [ ] No TypeScript errors (`npm run build`)
- [ ] All tests pass (`npm run test`)
- [ ] Code formatted (`npx prettier --write .`)
- [ ] No console.log statements left
- [ ] Environment variables added to .env.example
- [ ] Database migrations run successfully
- [ ] Commit message is clear and descriptive

## 📚 Useful Links

- [PostgreSQL Docs](https://www.postgresql.org/docs/16/)
- [Next.js Docs](https://nextjs.org/docs)
- [Node.js pg package](https://node-postgres.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Docker Docs](https://docs.docker.com/)
- [AWS ECS Guide](https://docs.aws.amazon.com/ecs/)

---

**Last Updated**: April 2026
**Current Phase**: 1/7 (Database & Authentication)
