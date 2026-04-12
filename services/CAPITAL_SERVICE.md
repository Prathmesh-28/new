# Capital Service

This service manages the public capital-raising infrastructure for revenue-share, Reg CF, and Reg A+ offerings.

## Overview

The Capital Service handles:
- Capital campaign setup and management
- Investor portal functionality
- Regulatory compliance (Reg CF, Reg A+)
- Revenue-share deal terms
- Escrow and distribution workflows

## Architecture

```
Capital Service (Node.js/ECS)
├─ Campaign Management
│  ├─ Campaign creation
│  ├─ Terms configuration
│  └─ Status tracking
├─ Investor Portal
│  ├─ Deal browsing
│  ├─ Investment tracking
│  └─ Document management
└─ Regulatory Engine
   ├─ Reg CF compliance
   ├─ Reg A+ handling
   └─ Revenue-share terms
```

## Capital Tracks

### Track A: Revenue-Share Crowdfunding

- Min raise: $10K
- Max raise: $500K
- Investor base: Friends & family, online
- Terms: Company shares X% of revenue for Y years
- Settlement: Monthly automated payouts

### Track B: Reg CF Equity Raise

- Min raise: Not specified
- Max raise: $5M per year (Regulation CF 506(c))
- Investor base: Accredited investors
- Terms: Standard equity with common stock
- Settlement: After SAFE conversion or equity close

### Track C: Reg A+ Mini-IPO

- Min raise: $75K (Tier 1) or $500K (Tier 2+)
- Max raise: $75M per year
- Investor base: All US accredited investors
- Terms: Preferred stock with liquidation preferences
- Settlement: Full qualified offering process

## Key Components

### 1. Campaign Lifecycle

```
Draft → Active → Target Met → Funded → Closed
        ↓
      Failed (didn't meet minimum)
```

### 2. Revenue-Share Terms

Configuration:
- Revenue threshold (when to start paying back)
- Percentage share (5-10% typical)
- Duration (3-5 years typical)
- Minimum monthly payment floor
- Acceleration on success milestones

### 3. Investor Portal

Features:
- Browse active campaigns
- Investment tracking dashboard
- Cap table visibility (Reg CF)
- Document download
- Tax reporting (1099-DIV for revenue-share)

### 4. Compliance Engine

Handles:
- Accredited investor verification
- Form C filing (Reg CF)
- Offering document generation
- Investor limit tracking
- State-by-state restrictions

## API Endpoints

```
POST /capital/raises
  Input: { tenant_id, track, target_amount, terms }
  Output: { raise_id, status: "draft" }

PATCH /capital/raises/:id
  Input: { status, terms }
  Output: Updated campaign

POST /capital/raises/:id/publish
  Output: { raise_id, status: "active", public_url }

POST /capital/investors/:id/invest
  Input: { investor_email, amount, accredited: boolean }
  Output: { investment_id, confirmation_email_sent }

GET /capital/raises/:id/dataroom
  Returns: Available Documents for download

POST /capital/raises/:id/close
  Input: { closing_date, final_amount }
  Output: { raise_closed, distributions_scheduled }
```

## Regulatory Checklists

### Reg CF (Track B)

- [ ] Form C drafted and reviewed
- [ ] Investor limit tracking enabled
- [ ] Investment limit per person enforced ($2,200 or 5% of income)
- [ ] Accredited verification in place
- [ ] Required disclosures provided
- [ ] Financial statements filed
- [ ] Annual reporting process defined

### Reg A+ (Track C)

- [ ] Offering statement prepared
- [ ] Underwriter engaged
- [ ] State qualification obtained
- [ ] SEC Reg A+ filing complete
- [ ] Testing period compliance tracked
- [ ] Investor caps enforced
- [ ] Ongoing reporting schedule established

## Database Schema Used

- `capital_raises` - campaign metadata and terms
- `capital_investors` - investor records

## Event Bus Integration

Publishes events to AWS SNS:
- `capital.raise_published` - Campaign goes live
- `capital.investment_received` - New investor
- `capital.raise_closed` - Campaign closes
- `capital.distribution_initiated` - Payout processing

## Settlement & Distributions

### Revenue-Share (Monthly)

```
1. Calculate monthly revenue
2. Apply revenue threshold
3. Calculate company's share
4. Add to distribution queue
5. Process ACH transfer to investor
6. Record in audit log
7. Send investor notification
```

### Equity Closing (One-time)

```
1. Verify all legal docs signed
2. Verify funds received in escrow
3. Release escrow to company
4. Issue stock certificates/SAFE agreements
5. Update cap table
6. Send investor confirmations
7. Record on blockchain (future)
```

## Environment Setup

```bash
cd services/capital-service

# Install dependencies
npm install

# Environment variables
cp .env.example .env.local

# Run service
npm run dev

# Service runs on port 8003
```

## Deployment

```bash
# Build Docker image
docker build -t headroom-capital:latest .

# Deploy to ECS Fargate
# See terraform/ directory for infrastructure
```

## Future Enhancements

- Tokenization (blockchain-based equity)
- Secondary market for revenue-share notes
- International fundraising (Reg S)
- Automated investor onboarding video KYC
- Credit score-based terms adjustment
- Integration with legal document providers (Carta, Pulley)
