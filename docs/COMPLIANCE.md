# Compliance — India fintech checklist

This documents what the product already supports and what you must put in place
before taking real money or lending at scale. It is engineering guidance, **not
legal advice** — have a lawyer review before go-live.

## 1. DPDP Act 2023 (data protection) — partially built
| Requirement | Status | Where |
|---|---|---|
| Consent ledger (purpose-bound, withdrawable) | ✅ built | `consents` table · Settings → Privacy & Data |
| Right to access / data portability | ✅ built | `GET /api/account/export` (JSON download) |
| Right to erasure (request) | ✅ built | `POST /api/account/deletion-request` |
| Grievance officer + 30-day response | ✅ surfaced | Settings → Privacy & Data footer |
| Published Privacy Policy + Notice | ⏳ **todo** | host a policy page; link from signup + footer |
| Breach notification process | ⏳ **todo** | operational runbook |
| Appoint Data Protection Officer (if SDF) | ⏳ **todo** | once user volume crosses thresholds |

**Action:** replace `grievance@headroom.app` (placeholder in `PrivacyCard.tsx`)
with a real, monitored mailbox and a named officer.

## 2. RBI Digital Lending Guidelines 2022 — built where it counts
Applies the moment you actually disburse credit (today disbursement is in
Preview until a lending partner is wired — see the Preview badges).

| Requirement | Status |
|---|---|
| Key Facts Statement (KFS) before acceptance | ✅ shown in Credit → KFS modal (lender, APR, fees, EMI, total, cooling-off, grievance) |
| Cooling-off / look-up period | ✅ stated (3 days) |
| Grievance redressal contact | ✅ in KFS |
| All-inclusive APR disclosure | ✅ in KFS — verify it includes processing fee in the APR math with your partner |
| LSP/DLA disclosure + regulated-entity name | ⏳ confirm the partner NBFC name shown is accurate per agreement |
| No automatic credit-limit increase without consent | ✅ consent-gated |
| Data stored only as needed, on Indian servers | ⏳ **todo** (see §4) |

## 3. KYC / AML — not built (blocker for lending)
- PAN / GSTIN / Aadhaar verification: capability flag `kyc` exists (gated off
  until `KYC_API_KEY` set) but no verification provider is wired.
- AML / fraud screening: `fraud_check_status` is currently a placeholder.
- **Action:** integrate a KYC vendor (e.g. Signzy/IDfy/Hyperverge) before
  onboarding any borrower; wire it behind the `kyc` capability.

## 4. Data localisation & security
- RBI requires payment data stored in India. Confirm your Postgres (Render)
  region is India, or migrate. Document data residency.
- Encryption at rest: enable DB-level encryption; encrypt uploaded files
  (currently stored as plaintext BYTEA).
- Secrets: all via env (✅). Rotate the test Razorpay keys + Twilio token before
  production.

## 5. Data retention schedule (suggested)
| Data | Retain | Then |
|---|---|---|
| Loan/credit records | 8 years (RBI/tax) | purge |
| Invoices/GST records | 8 years (GST/IT Act) | purge |
| Transaction ledger | 8 years | purge |
| Auth/audit logs | 1–2 years | purge |
| Marketing consent withdrawn | stop immediately | delete on erasure request |

Erasure requests are honoured for everything **except** the statutory-retention
items above, which are purged automatically once their period lapses. This is
why deletion is a *request* + retention window, not an instant wipe.

## 6. Operational backlog
- [ ] Host Privacy Policy + Terms; link from signup and site footer.
- [ ] Real grievance mailbox + named officer.
- [ ] KYC/AML provider integration.
- [ ] Confirm India data region + at-rest encryption.
- [ ] Process pending `deletion_requests` (admin tooling) on a schedule.
