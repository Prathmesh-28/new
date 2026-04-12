# Credit Service

This service manages the embedded credit marketplace, underwriting, and offer routing.

## Overview

The Credit Service handles:
- Credit application processing
- Underwriting (silent pre-qualification)
- Lender offer aggregation
- Repayment simulation
- Integrated credit scoring

## Architecture

```
Credit Service (Node.js/ECS)
├─ Underwriting Engine
│  ├─ Financial analysis
│  ├─ Risk scoring
│  └─ Pre-qualification
├─ Lender Integration
│  ├─ Offer routing
│  ├─ Rate engine
│  └─ Term calculation
└─ Offer Management
   ├─ Expiration tracking
   ├─ Acceptance workflow
   └─ Funded state tracking
```

## Key Components

### 1. Silent Underwriting

Scores creditworthiness without explicit application:
- Cash flow analysis (from forecasts)
- Historical burn rate
- Industry classification
- Bank account signals (balances, patterns)
- Results in: credit_score (300-850), underwriting_score (0-1)

### 2. Lender Integration

Routes applications to multiple lenders:
- Stripe Capital (for Stripe-connected businesses)
- Brex (US-based businesses under $50M revenue)
- OnDeck (established businesses)
- Lendio (SMB marketplace)
- Custom partner APIs

### 3. Offer Engine

- Generates personalized offers based on tenant profile
- Calculates monthly payments for chosen term
- Simulates impact on cash flow
- Validates against covenants (debt service coverage ratio, etc.)

### 4. Repayment Simulation

- Incorporates approved credit into cash forecasts
- Shows: "What if we take this loan? How does it affect runway?"
- Highlights risk (e.g., tight months post-loan)

## API Endpoints

```
POST /credit/applications
  Input: { tenant_id }
  Output: { application_id, status: "draft" }

POST /credit/applications/:id/submit
  Input: { loan_amount, term_months, purpose }
  Output: { application_id, status: "submitted", offers[] }

GET /credit/applications/:id
  Returns: Full application with underwriting scores and offers

POST /credit/offers/:id/accept
  Input: { offer_id }
  Triggers: Underwriting completion, funding workflow

GET /credit/offers/:id/impact
  Input: { tenant_id, offer_id }
  Output: Updated forecast assuming loan
```

## Underwriting Factors

- Cash flow stability (coefficient: 0.30)
- Revenue growth (coefficient: 0.20)
- Expense control (coefficient: 0.20)
- Industry risk (coefficient: 0.15)
- Bank account signals (coefficient: 0.15)

Formula: `underwriting_score = Σ(factor × coefficient)`

## Lender Routing Logic

```javascript
// PseudoCode
function routeToLenders(tenant, application) {
  const offers = [];
  
  if (hasStripeConnect(tenant)) {
    offers.push(stripCapitalOffer(tenant, application));
  }
  
  if (monthlyRevenue > 50000) {
    offers.push(brexOffer(tenant, application));
  }
  
  if (yearsInBusiness > 2) {
    offers.push(onedeckOffer(tenant, application));
  }
  
  // Always fallback to marketplace
  offers.push(lendioOffer(tenant, application));
  
  return sortByRate(offers);
}
```

## Database Schema Used

- `credit_applications` - main application record
- `credit_offers` - received offers from lenders

## Event Bus Integration

Publishes events to AWS SQS:
- `credit.application_submitted` - App submitted
- `credit.offers_received` - Offers returned from lenders
- `credit.offer_accepted` - Customer accepted offer
- `credit.funded` - Loan successfully funded

## Environment Setup

```bash
cd services/credit-service

# Install dependencies
npm install

# Environment variables
cp .env.example .env.local

# Run service
npm run dev

# Service runs on port 8002
```

## Deployment

```bash
# Build Docker image
docker build -t headroom-credit:latest .

# Deploy to ECS Fargate
# See terraform/ directory for infrastructure
```

## Integration Points

### Input from other services:
- Forecast Service: Cash flow data for underwriting
- Transaction data: Historical patterns
- External APIs: Credit bureaus, lender networks

### Output to other services:
- Forecast Service: Loan impact simulation
- Event Bus: Credit events for other services
- Parent app: Offer display and acceptance

## Future Enhancements

- Machine learning for offer optimization
- Real-time lender rate updates
- Automated collateral matching
- SBA loan program routing
- Equipment financing integration
