# Headroom Production Architecture Implementation

This document summarizes the transformation from the prototype (Next.js + SQLite) to the production-grade multi-tenant SaaS platform.

## 🎯 Mission

**Design principle**: Every architectural decision supports this constraint — an SMB owner with no technical background connects their bank account and sees an accurate 90-day cash forecast within 10 minutes. Complexity lives in the infrastructure, never in the experience.

## 🏗️ Architecture Pillars

### 1. Three Independent Product Pillars

```
┌─────────────────────────────────────────────────────────────┐
│                  Headroom SaaS Platform                      │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ Forecasting│    │   Credit   │    │  Capital   │
    │   Engine   │    │ Marketplace│    │  Raising   │
    │            │    │            │    │            │
    │ Cash flow  │    │ Underwriting│   │ Reg CF/A+  │
    │ projections│    │ Offers     │    │ Investor   │
    │ 90 days    │    │ Rescues    │    │ Portal     │
    └────────────┘    └────────────┘    └────────────┘
         ↓                    ↓                    ↓
    (Core Value)        (Revenue #2)      (Revenue #3)
```

### 2. User Roles (Multi-tenant)

- **Owner**: SMB business owner (primary user, accesses all features)
- **Accountant**: Secondary user (limited access to financial data)
- **Investor**: Capital layer only (viewed by tertiary users)
- **Admin**: Internal Headroom staff (multi-tenant management)

### 3. Scalable Technology Stack

```
Layer            | Technology        | Hosting
─────────────────┼──────────────────┼──────────────────
Web Frontend     | React (TypeScript)| Vercel (CDN)
Mobile Apps      | React Native      | App Store/Play
API Gateway      | REST + GraphQL    | AWS API Gateway
Services         | Python + Node.js  | AWS ECS Fargate
Database         | PostgreSQL        | AWS RDS (Multi-AZ)
Cache            | Redis             | AWS ElastiCache
Message Bus      | SQS + SNS         | AWS
Storage          | S3 + Secrets Mgr  | AWS
Monitoring       | Datadog + PagerDuty| SaaS
```

## 📦 What's Been Completed (Phase 1)

### ✅ Database Migration
- Designed PostgreSQL multi-tenant schema (15+ tables)
- Each tenant is isolated at database level with `tenant_id` foreign key
- UUID-based identifiers (globally unique)
- Comprehensive indexes for performance
- Foreign key constraints for data integrity

**Schema includes:**
- Multi-tenancy foundation (tenants, users, sessions)
- Bank data layer (bank_connections, transactions)
- Forecasting layer (forecasts, forecast_datapoints)
- Credit layer (credit_applications, credit_offers)
- Capital layer (capital_raises, capital_investors)
- Audit trail (audit_log, rate_limits, events)

### ✅ Authentication Refactor
- Moved from SQLite session storage to PostgreSQL
- Async authentication (all database calls now awaitable)
- Email-based login (instead of username)
- Multi-tenant session isolation
- Preserved secure cookie handling (httpOnly, sameSite, secure)

**Auth Flow:**
```
User → /api/admin/login (POST)
     ↓ (verify email + password)
PostgreSQL sessions table
     ↓ (create 8-hour session token)
Response + httpOnly cookie
```

### ✅ Configuration & DevOps
- Created `docker-compose.yml` with PostgreSQL + Redis
- Database seed scripts with demo users
- `.env.example` with all configuration variables
- Environment variables for database connection
- Bootstrap scripts for schema initialization

### ✅ Comprehensive Documentation
- `ARCHITECTURE_SETUP.md`: Complete setup guide
- `ARCHITECTURE_SPECIFICATION.md`: Full architecture details
- Service specifications (Forecast, Credit, Capital, Data Integration)
- AWS infrastructure guide with Terraform examples
- `COMPLETION_CHECKLIST.md`: Track progress across 7 phases

## 🔄 How to Get Started

### Local Development (5 minutes)

```bash
# 1. Start database and cache
docker-compose up -d

# 2. Copy environment variables
cp .env.example .env.local

# Edit .env.local with your database credentials (defaults work with docker-compose)

# 3. Install dependencies
npm install

# 4. Initialize database
npx ts-node src/db/init.ts

# 5. Run development server
npm run dev

# Visit http://localhost:3000
```

**Demo Credentials:**
```
Email: admin@headroom.local
Password: headroom@2024
```

### Production Deployment (AWS)

See `/infrastructure/AWS_INFRASTRUCTURE.md` for:
- Terraform infrastructure setup
- RDS Multi-AZ PostgreSQL
- ECS Fargate cluster
- ElastiCache Redis
- API Gateway
- S3 buckets
- Monitoring with Datadog

## 📋 What's Next (Phases 2-7)

### Phase 2: Core Services (4-6 weeks)

**Forecast Service (Python/ECS)**
- Normalize transactions (categorize, deduplicate)
- Detect recurring patterns
- Generate 90-day projections with confidence bands
- Create alerts for cash flow warnings

**Credit Service (Node.js/ECS)**
- Implement underwriting logic
- Route to appropriate lenders
- Generate personalized offers
- Simulate repayment impact on forecasts

**Capital Service (Node.js/ECS)**
- Campaign management (Reg CF, Reg A+, Revenue-share)
- Investor portal
- Compliance automation
- Distribution workflows

### Phase 3: AWS Infrastructure (2-3 weeks, parallel with Phase 2)

→ See `infrastructure/AWS_INFRASTRUCTURE.md` for complete terraform setup

### Phase 4: Frontend Rebuild (4-6 weeks)

**React SPA redesign for multi-tenant:**
- Authentication and multi-workspace
- Dashboard with forecasts
- Credit marketplace
- Capital raising interface
- Admin panel

→ Deploy to Vercel for edge caching

### Phase 5: Data Connectors (3-4 weeks)

**Bank Integrations:**
- Plaid (12,000+ financial institutions)
- Real-time transaction sync

**Accounting Platforms:**
- QuickBooks Online
- Xero
- Wave

→ Python Lambda workers for data sync

### Phase 6: Advanced Features (4-6 weeks)

- ML model training & inference (SageMaker)
- Compliance automation (regulatory documents)
- Mobile app (React Native)
- Advanced credit features (SBA, equipment financing)

### Phase 7: Production Hardening (2-3 weeks)

- Security audit & penetration testing
- Performance optimization
- Comprehensive test coverage
- Documentation & runbooks
- Incident response procedures

## 🔐 Security Considerations

### ✅ Implemented
- Password hashing (bcryptjs)
- Secure cookies (httpOnly, sameSite, secure flag)
- SQL injection prevention (parameterized queries)
- Multi-tenant isolation (database level)
- UUID-based identifiers (prevent ID enumeration)
- Audit logging for compliance

### 🔒 To Implement
- Rate limiting on API endpoints
- Request validation & sanitization
- OAuth 2.0 for third-party integrations
- Security headers (CSP, X-Frame-Options)
- DDoS protection (AWS Shield)
- Web application firewall (AWS WAF)

## 📊 Scalability & Performance

### Target Performance

```
API Response Time (p95)         < 200ms
Forecast Generation             < 30 seconds
Database Query (p95)            < 100ms
Page Load Time (First Paint)    < 2 seconds
Uptime                          > 99.9%
```

### Horizontal Scaling

```
Forecast Service:  2-10 replicas (scale on CPU)
Credit Service:    1-5 replicas (scale on memory)
Capital Service:   1-3 replicas (lower volume)
Database:          Read replicas for queries
Cache:             3-node Redis cluster (automatic failover)
```

## 💰 Deployment Costs

### Development
- PostgreSQL (local Docker): Free
- Multi-platform testing: Free

### Staging (AWS)
- RDS:               $50/mo
- ECS:               $150/mo
- Cache/Storage:     $50/mo
- **Total:           ~$250/mo**

### Production (AWS)
- RDS Multi-AZ:      $1,200/mo
- ECS Fargate (3 services): $800/mo
- ElastiCache:       $400/mo
- Storage/CDN/Other: $600/mo
- **Total:           ~$3,000/mo** (scales with traffic)

## 📚 Documentation Structure

```
/
├─ ARCHITECTURE_SETUP.md          ← Quick start guide
├─ COMPLETION_CHECKLIST.md        ← 7-phase completion tracker
├─ README.md                      ← This file
├─ services/
│  ├─ FORECAST_SERVICE.md
│  ├─ CREDIT_SERVICE.md
│  ├─ CAPITAL_SERVICE.md
│  └─ DATA_INTEGRATION.md
├─ infrastructure/
│  └─ AWS_INFRASTRUCTURE.md
└─ src/
   └─ db/
      ├─ schema.sql               ← Multi-tenant schema
      └─ seed.sql                 ← Demo data
```

## 🚀 Development Workflow

### For Developers Working on Services

```bash
# Create a new service
mkdir services/<service-name>
cd services/<service-name>

# Copy template
cp ../templates/service-template .

# Implement service
# - Update API endpoints
# - Implement business logic
# - Add unit tests
# - Create Docker image

# Test locally
docker-compose up

# Test integration with main app
npm run test:integration

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

### For Frontend Developers

```bash
# The frontend now needs to connect to multiple services
# Configuration in .env.local:

NEXT_PUBLIC_FORECAST_API=http://forecast-service:8001
NEXT_PUBLIC_CREDIT_API=http://credit-service:8002
NEXT_PUBLIC_CAPITAL_API=http://capital-service:8003

# Services communicate through event bus (SQS/SNS)
```

## 🧪 Testing Strategy

- **Unit Tests**: Each service independently (jest, pytest)
- **Integration Tests**: Service with database (e2e Docker environment)
- **API Tests**: REST and GraphQL endpoints (Postman/Newman)
- **E2E Tests**: Full user journeys (Cypress)
- **Load Tests**: Traffic simulation (k6, JMeter)
- **Security Tests**: OWASP top 10 (Burp Suite)

## 📞 Support & Questions

Refer to:
- `ARCHITECTURE_SETUP.md` for deployment questions
- `services/*.md` for service-specific details
- `infrastructure/AWS_INFRASTRUCTURE.md` for AWS questions
- Generated API documentation (OpenAPI/Swagger)

## 🎓 Learning Resources

- [Next.js 14 Docs](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [AWS ECS Fargate Guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_FARGATE.html)
- [Terraform Best Practices](https://www.terraform.io/docs/language/modules/)

---

**Last Updated**: April 2026
**Status**: Phase 1 Complete ✅ | Phase 2-7 In Progress
