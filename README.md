# Headroom: SMB Cash Flow Forecasting & Capital Platform

Headroom is a production-grade multi-tenant SaaS platform helping SMB owners manage cash flow, access embedded credit, and raise capital. Built with scalable microservices architecture on AWS.

## 🎯 Value Proposition

**Design principle**: An SMB owner with no technical background connects their bank account and sees an accurate 90-day cash forecast within 10 minutes. Complexity lives in the infrastructure, never in the experience.

## 📦 Three Product Pillars

### 1. **Cash Flow Forecasting Engine** 💰
- Connects bank accounts and accounting platforms
- Generates 90-day projections with confidence bands (best/expected/downside)
- Real-time alerts for cash warnings
- Deduplication and normalization of transactions
- Machine learning-based pattern detection

### 2. **Embedded Credit Marketplace** 💳
- Silent underwriting (pre-qualification without explicit application)
- Aggregated lender offers (Stripe Capital, OnDeck, Brex, etc.)
- Repayment simulation integrated with forecasts
- $50K-$500K loan range

### 3. **Public Capital-Raising Infrastructure** 🚀
- **Track A**: Revenue-share crowdfunding ($10K-$500K)
- **Track B**: Reg CF equity raises (up to $5M/year)
- **Track C**: Reg A+ mini-IPO (up to $75M/year)
- Investor portal with detailed metrics

## 🏗️ Architecture

```
┌─ Client Layer ────────────────────┐  ┌─ API Gateway ─────────────┐
│ • React SPA (Vercel)              │  │ • REST + GraphQL           │
│ • React Native (iOS/Android)      │  │ • Auth, Rate Limiting      │
└───────────────┬────────────────────┘  └────────┬──────────────────┘
                │                                 │
                └─────────────────┬────────────────┘
                                  ↓
            ┌─ Microservices ────────────────────┐
            │ • Forecast Engine (Python/ECS)    │
            │ • Credit Service (Node/ECS)       │
            │ • Capital Service (Node/ECS)      │
            └──────────────────┬─────────────────┘
                              ↓
         ┌──── Data Layer ────────────────┐
         │ • PostgreSQL (Multi-AZ)        │
         │ • Redis Cache (ElastiCache)    │
         │ • S3 (Documents, Exports)      │
         │ • SQS/SNS (Event Bus)          │
         └────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| **Web Frontend** | React 18 + TypeScript | Vercel (CDN) |
| **Mobile** | React Native | App Store / Play Store |
| **API Gateway** | Node.js | AWS API Gateway |
| **Services** | Python + Node.js | AWS ECS Fargate |
| **Database** | PostgreSQL 16 | AWS RDS (Multi-AZ) |
| **Cache** | Redis 7 | AWS ElastiCache |
| **Message Bus** | - | AWS SQS + SNS |
| **Storage** | - | AWS S3 + Secrets Manager |
| **Monitoring** | - | Datadog + PagerDuty |

## 🚀 Quick Start

### Local Development (5 minutes)

```bash
# Prerequisites: Docker, Node.js 20+, PostgreSQL client

# 1. Clone repository
git clone https://github.com/headroom/headroom.git
cd headroom

# 2. Start PostgreSQL and Redis
docker-compose up -d

# 3. Initialize environment
cp .env.example .env.local

# 4. Run setup script
bash scripts/init-dev-env.sh

# 5. Start development server
npm run dev

# 6. Start local service stack
# In another terminal, run:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# 7. Open the app
http://localhost:3000

# 8. Local service ports
- Forecast: http://localhost:8001/health
- Credit: http://localhost:8002/health
- Capital: http://localhost:8003/health
```

**Demo Credentials:**
```
Email: admin@headroom.local
Password: headroom@2024
```

## 📊 Multi-Tenant Architecture

### User Roles
- **Owner**: SMB business owner (primary user, all features)
- **Accountant**: Secondary user (financial data access)
- **Investor**: Capital layer only (for capital campaigns)
- **Admin**: Headroom staff (multi-tenant management)

### Tenant Isolation
- Database-level multi-tenancy with `tenant_id` foreign keys
- Row-level security via SQL policies
- Separate encryption keys per tenant (future)
- Audit logging for all tenant activities

## 🔐 Security

✅ **Implemented**
- Password hashing (bcryptjs, salt rounds: 12)
- Secure cookies (httpOnly, sameSite: lax, secure flag)
- SQL injection prevention (parameterized queries)
- Multi-tenant isolation (database level)
- User session management (8-hour TTL)
- Audit trail logging

🔒 **Enterprise Features (Coming Soon)**
- Rate limiting per user/API key
- OAuth 2.0 for third-party integrations
- Web Application Firewall (AWS WAF)
- DDoS protection (AWS Shield)
- Penetration testing results

## 📈 Scalability & Performance

### Performance Targets
- API response time (p95): < 200ms
- Forecast generation: < 30 seconds
- Page load time: < 2 seconds
- Uptime: > 99.9%

### Horizontal Scaling
```
Forecast Service:  2-10 replicas (auto-scale on CPU)
Credit Service:    1-5 replicas
Capital Service:   1-3 replicas
Database:          Read replicas for queries
Cache:             3-node Redis (auto-failover)
```

## 📚 Documentation

- **[PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md)** - Complete architecture overview
- **[ARCHITECTURE_SETUP.md](ARCHITECTURE_SETUP.md)** - Database and setup guide
- **[COMPLETION_CHECKLIST.md](COMPLETION_CHECKLIST.md)** - 7-phase implementation tracker
- **[services/](services/)** - Service-specific documentation
- **[infrastructure/AWS_INFRASTRUCTURE.md](infrastructure/AWS_INFRASTRUCTURE.md)** - AWS deployment guide

### Service Documentation
- **[FORECAST_SERVICE.md](services/FORECAST_SERVICE.md)** - 90-day forecasting engine
- **[CREDIT_SERVICE.md](services/CREDIT_SERVICE.md)** - Credit marketplace & underwriting
- **[CAPITAL_SERVICE.md](services/CAPITAL_SERVICE.md)** - Reg CF/Reg A+ capital raising
- **[DATA_INTEGRATION.md](services/DATA_INTEGRATION.md)** - Bank & accounting connectors

## 🧩 Development Setup

### Project Structure

```
headroom/
├── src/
│   ├── app/                  # Next.js App Router (current)
│   ├── components/           # React components
│   ├── lib/                  # Shared utilities
│   │   ├── auth.ts          # Authentication
│   │   └── db.ts            # PostgreSQL client
│   └── db/
│       ├── schema.sql       # Multi-tenant schema
│       └── seed.sql         # Demo data
├── services/                 # Microservices (coming)
│   ├── forecast-service/
│   ├── credit-service/
│   └── capital-service/
├── infrastructure/           # AWS Terraform
├── scripts/
│   ├── init-dev-env.sh      # Setup development
│   └── deploy.sh            # Deploy to AWS
└── docs/                     # Additional documentation
```

### Database Schema

**Core Tables:**
- `tenants` - Multi-tenant companies
- `users` - All users across tenants
- `sessions` - Active session tokens
- `bank_connections` - Connected bank accounts
- `transactions` - Normalized transaction data
- `forecasts` - 90-day cash projections
- `credit_applications` - Loan applications
- `capital_raises` - Capital campaigns

See [ARCHITECTURE_SETUP.md](ARCHITECTURE_SETUP.md#database-schema) for full schema.

## 🚢 Deployment

### Local Development
```bash
docker-compose up -d
npm run dev
```

### Staging (AWS)
```bash
bash scripts/deploy.sh staging
```

### Production (AWS)
```bash
bash scripts/deploy.sh production
```

See [infrastructure/AWS_INFRASTRUCTURE.md](infrastructure/AWS_INFRASTRUCTURE.md) for detailed AWS deployment.

## 📊 Monitoring & Observability

- **CloudWatch**: AWS native logs and metrics
- **Datadog**: APM, dashboards, alerts
- **PagerDuty**: Incident management
- **X-Ray**: Distributed tracing

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## 📋 Implementation Phases

### ✅ Phase 1: Database & Authentication (COMPLETE)
- PostgreSQL multi-tenant schema
- User authentication system
- Docker-Compose setup

### ⏳ Phase 2: Core Services (4-6 weeks)
- Forecast Service (Python)
- Credit Service (Node.js)
- Capital Service (Node.js)

### ⏳ Phase 3: AWS Infrastructure (2-3 weeks)
- Terraform configuration
- ECS Fargate deployment
- RDS, Redis, S3 setup

### ⏳ Phase 4: Frontend (4-6 weeks)
- React SPA redesign (multi-tenant)
- Vercel deployment

### ⏳ Phase 5: Data Connectors (3-4 weeks)
- Plaid bank integration
- QuickBooks/Xero integration
- Lambda data sync workers

### ⏳ Phase 6: Advanced Features (4-6 weeks)
- ML forecasting models
- Regulatory compliance
- React Native mobile app

### ⏳ Phase 7: Production Hardening (2-3 weeks)
- Security audit
- Performance optimization
- Comprehensive testing

See [COMPLETION_CHECKLIST.md](COMPLETION_CHECKLIST.md) for detailed phase breakdown.

## 💡 Key Features

### Forecasting Engine
- Automatic transaction categorization
- Recurring pattern detection
- Seasonality analysis
- Anomaly detection
- Confidence-based scenarios (best/expected/downside)
- 90-day rolling projections

### Credit Marketplace
- Silent underwriting (no explicit application needed)
- Multi-lender offer aggregation
- Personalized rate quotes
- Repayment impact simulation
- $50K-$500K loan range

### Capital Raising
- **Revenue-share**: $10K-$500K with monthly payouts
- **Reg CF**: Up to $5M equity raises  
- **Reg A+**: Up to $75M mini-IPO offerings
- Investor portal with metrics
- Compliance automation

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request
4. Code review & CI/CD checks
5. Merge to main (auto-deploys)

## 📝 License

Proprietary - All rights reserved

## 📞 Support

- **Documentation**: See `/docs` and linked markdown files
- **Issues**: GitHub Issues
- **Email**: support@headroom.com

## 🎓 Learning Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [AWS ECS Guide](https://docs.aws.amazon.com/AmazonECS/)
- [Terraform Best Practices](https://www.terraform.io/docs/language/modules/)

---

**Status**: Phase 1 Complete ✅ | Phases 2-7 In Development

**Last Updated**: April 2026