# Headroom — Codebase & Capability Audit

**Audit date:** 2026-06-16 · **Scope:** full frontend (`src/`), backend (`backend/`), config & build · **Method:** automated build/test/typecheck runs + static inspection of routes, role config, persistence, and in-code disclosure markers. **Not** a manual click-through of all 1,465 tools — see *Limitations*.

---

## 1. Executive summary

Headroom is an **unusually broad** India-first SMB finance platform: **55 modules, 1,465 registered tools, ~143,400 lines** of TypeScript/React, shipping on Web + iOS + Android. It **builds clean** (`tsc -b` ✅, `vite build` ✅, 2,818 modules) and all **47 tests pass**.

**Honest headline:** the breadth is real and the build is healthy, but the surface is **overwhelmingly client-side calculators/trackers** persisted to a synced key-value store, sitting on top of a **narrower but genuine backend core** (invoices, transactions, GST, payroll, credit, collections, billing). A meaningful fraction is explicitly **indicative / simulated / preview** (by the code's own labels). Automated test coverage and file-size discipline are the two biggest engineering risks.

| Dimension | Rating | Note |
|---|---|---|
| Build & type safety | 🟢 Good | Clean `tsc -b` + vite; 2,818 modules transformed |
| Breadth of capability | 🟢 Exceptional | 55 modules / 1,465 tools across 8 stakeholder roles |
| Backend depth | 🟡 Mixed | 148 routes for a **core** set; most newer modules are KV-only |
| Automated test coverage | 🔴 Weak | **47 tests / 4 files** for 1,465 tools (~lib-only) |
| Maintainability | 🟡 At risk | 5 page files >3,800 lines (largest 4,842) |
| Honesty of claims | 🟡 Caveat | 163 "indicative", 123 "simulated", 210 "preview" markers |
| On-device QA | 🔴 Not done | Build-verified only; iOS install still pending |
| Architecture clarity | 🟡 Caveat | Dual backend referenced (Node live + a Django host) |

---

## 2. What was verified (evidence)

```
typecheck (tsc -b) ........ exit 0  ✅
production build (vite) ... exit 0  ✅  (2,818 modules, ~5s)
unit tests (vitest) ....... 47 passed / 4 files  ✅
feature pages ............. 55
tool/tab registrations .... 1,465
source LOC ................ ~143,408
test files ................ 4  (lib: finance, forecastEngine, gstReconcile, anomalies)
useFeatureState sites ..... 830   (durable, KV-synced)
files reading live store .. 53
backend route handlers .... 148   across ~33 route groups
disclosure markers ........ indicative:163  simulated:123  preview:210
external endpoints ........ api.qrserver.com, wa.me, api.whatsapp.com, rzp.io,
                            g.page, api.you.com, hooks.example.com (placeholder)
```

---

## 3. Architecture

**Frontend** — React 19 + TypeScript + Vite + Tailwind; React Router; Capacitor 7 for iOS/Android. Pages are lazy-loaded and code-split. Styling is CSS-variable based; a global responsive layer (≤768px) wraps tables in horizontal scroll and wraps tab strips.

**State & persistence** — Two tiers:
1. **Core domain data** (`store.transactions`, `invoices`, `bankAccounts`, `activeLoans`, etc.) — backed by backend tables, synced.
2. **Feature data** — `useFeatureState(key, initial)` (830 sites) writes to `store.featureData` → persisted to the **`/api/kv` KV store** (Postgres `kv_store`, tenant-scoped, namespaced) and live-synced across devices. This is how the vast majority of the 1,465 tools persist user-entered records. **It is real persistence, but not server-side business logic** — computation happens in the browser.

**Backend** — Node/Express (`backend/src`, 148 route handlers) on PostgreSQL (`kv_store` + domain tables incl. disbursement/EWA/BNPL schemas). Real route groups include: `auth, users, invoices, transactions, gst, payroll, credit, capital, collections, lenders, operations, suppliers, treasury, alerts, advisor, whatsapp, bnpl, ewa, connectors, ai, notes, files, billing, admin, kv, telemetry`. **Razorpay is wired** (`/webhook/razorpay`, `/api/billing` subscription checkout) and a **WhatsApp webhook** exists — so subscription billing and payment-collection callbacks are genuine, not mocked.

**⚠️ Dual-backend ambiguity** — `.env.local` points the app at `VITE_API_URL=http://localhost:4000` (the Node/Express backend, deployed to Render in prod) **and** also defines `NEXT_PUBLIC_DJANGO_API_URL=http://13.54.2.137:8000`. The Node backend is the live one; the Django reference appears legacy/secondary. **Recommendation:** confirm and document the single canonical backend; remove the dead reference to avoid confusion.

**Auth & access** — `/auth` endpoints; 8 roles with per-role `accessibleTabs`, enforced both in the route guard (`GUARDED_TABS` in `App.tsx`) and `canAccess()`/`canEdit()`/`canExport()` in `AppContext`. Read-only roles (viewer) and advisor "client view" correctly gate writes.

---

## 4. Capability inventory by module (55 modules)

Counts are tool/tab registrations (some include UI state tokens). **Backend-backed** = has a dedicated server route group beyond KV.

### Sell & Get Paid
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| Invoices | 34 | ✅ | quotes, proforma, recurring, e-invoice JSON, PO match, pay-links, TDS/TCS, multi-currency |
| Collections | ~30 | ✅ | dunning ladder, DSO, promise-to-pay, ECL, write-off, recovery |
| Receivables | 26 | KV | DSO trend, risk scoring, factoring, cash application, ageing heatmap |
| Payments | 32 | partial (Razorpay) | UPI QR/intent, NACH, settlement recon, MDR, gateway compare |
| Sales / CRM | 45 | KV | pipeline, deals, commissions, customer 360, forecast, RFM, win/loss |
| Marketplace / ONDC | 32 | KV | settlement & GSTR-8/TCS-52 recon, FBA fees, repricing, payout |
| WhatsApp | 22 | ✅ (webhook) | invoice & pay, reminders, statements, catalog, broadcasts |

### Tax & Compliance
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| GST | 52 | ✅ | GSTR-1/3B, 2B-vs-books ITC, e-invoice, RCM, refunds, Sec-50 interest |
| Income Tax & TDS | 57 | KV | regime optimizer, 44AD/ADA/AE, cap-gains, TDS returns, 234A/B/C |
| Compliance | 32 | KV | ROC, DIR-3/DPT-3, labour-law, licenses, POSH, CSR, penalty estimator |
| Payroll | 43 | ✅ | full run, PF/ESI/PT/LWF, gratuity, TDS-192, Form 16, EWA, ESOP |

### Money & Cash
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| Banking | 41 | KV | multi-bank, reconciliation, NACH, virtual a/c, rail chooser, sweep |
| Working Capital | 24 | KV | CCC, drawing power, MPBF, OD/CC, factoring-vs-OD |
| Forecast | 25 | ✅ (engine tested) | 13-week, AR inflow, burn/zero-cash, runway, probabilistic |
| Treasury | 46 | ✅ | sweep, FD ladder, SIP, T-bill, SGB, XIRR, DICGC, ALM |
| Spend / Budgets | 24 | KV | categorisation, cards, variance, ZBB, reforecast |
| Transactions / Statements | 33 | ✅ | journal, trial balance, ledgers, P&L/BS/CF, Schedule III, ratios |

### Funding & Growth
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| Credit | 29 | ✅ | **AA underwriting**, eligibility, EMI, DSCR, invoice discounting, LAP |
| Capital / Lenders | 32 | ✅ | runway, grants, lender CRM, covenant, syndication, BNPL/EWA |
| Valuation / Term Sheet | 44 | KV | DCF/comps/VC-method, cap table, dilution, ESOP, anti-dilution |
| Investor | — | ✅ (advisor) | updates, board deck, KPI tearsheet, data room |

### Operations
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| Operations / Inventory | 51 | ✅ | stock ledger, batch/expiry, BOM, EOQ, GRN-vs-PO, dispatch |
| Vendors | 28 | ✅ | PO, 3-way match, AP ageing, MSME 43B(h), vendor TDS |
| Suppliers | ~16 | ✅ | scorecards, reorder, rate contracts, Udyam verify |
| Field & Offline | 29 | KV | kirana bill, offline queue, GPS collection, beat plan, PoD |

### Intelligence & AI
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| AI CFO Copilot | 37 | ✅ (`/api/ai`) | daily brief, recommended actions, explain-a-number, guardrails |
| Analytics / Benchmarks | 26 | KV | profitability, cohorts, unit economics, sector bands |
| Predict / Digital Twin | 27 | KV | cash projection, pay-date predictor, Monte-Carlo, what-if |
| Dashboard / CFO Brief / Health | 46 | KV | snapshots, board briefs, Altman-Z, stress test |
| Scenarios | 22 | KV | price/hiring/funding/FX/cost-inflation modelling |

### Trust, Data & Reach
| Module | Tools | Backend-backed | Highlights |
|---|---|---|---|
| Security / Fraud | 32 | KV | anomaly, Benford, duplicate/round-trip, payee watch |
| Privacy & Consent | 39 | partial (`/consent`) | AA consent, DPDP log, DSAR, RoPA, breach log |
| Documents | 29 | ✅ (`/api/files`) | OCR, e-sign, vault, KYC collector, statutory packs |
| Data / Connectors | 44 | partial | Tally bridge, CSV mapping, consolidation; connectors mostly simulated |
| Voice / Vernacular | ~30 real | KV | voice expense, spoken invoice, read-aloud, lakh/crore |
| Settings / Admin | — | ✅ (`/api/admin`) | roles, approvals, books-lock, API keys, tenant onboarding |
| Tokens / Frontier | 26 | ❌ preview | e-Rupee/CBDC, programmable money, autonomous treasury — **labelled preview** |

---

## 5. Stakeholder × capability matrix

Access is enforced via per-role `accessibleTabs` (source: `src/data/defaultConfig.ts`).

| Stakeholder (role) | Modules | What they can do |
|---|---|---|
| **Business Owner** | 52 | Everything except super-admin: full finance, tax, payroll, credit, growth, AI CFO |
| **Super Admin** | 54 | All modules + platform admin (tenants, users, feature flags) |
| **Finance Manager** | 30 | Books, GST, TDS, payroll, banking, WC, forecast, collections, compliance, analytics |
| **Accountant / CA / CFO** | 14 | Client workspace (advisor), transactions, GST, tax, compliance, statements, working capital, docs/data — filing-focused |
| **Sales / Collections** | 9 | Invoices, receivables, collections, analytics, benchmarks, docs |
| **Operations Manager** | 9 | Operations, suppliers, vendors, spend, docs, benchmarks, alerts |
| **Investor** | 5 | Investor portfolio, capital, valuation, term sheet, lenders (read-oriented) |
| **Viewer (read-only)** | 6 | Dashboard, analytics, health, CFO brief, forecast, benchmarks — no writes |

**Finding 🟢:** the role model is coherent and matches the target "owner + small team + CA + investor/lender" thesis. Write-gating for read-only/advisor-client views is implemented.

**Finding 🟡:** the newer modules (sales, payments, insurance, treasury, esg, global, etc.) are granted to **owner/super_admin only** — finance/sales/ops roles don't yet see them. Intentional or an oversight from the build waves? **Recommend** reviewing role grants for the ~20 newest modules.

---

## 6. Real vs. Indicative vs. Simulated — the honesty audit

This is the most important section for not over-promising.

- 🟢 **Genuinely backend-integrated** (server logic + DB): invoices, transactions, GST data, payroll, credit applications, collections, lenders, operations, treasury, files/docs, alerts, advisor, AI brief, **Razorpay billing & payment webhooks**, admin/tenant management.
- 🟢 **Real persistence, client-side compute** (the bulk): ~830 `useFeatureState` tools store user records to the synced KV store and compute in-browser. Fully functional for a single business, just not server-orchestrated.
- 🟡 **Indicative / heuristic (163 markers):** sector benchmark bands, some statutory rates/thresholds (minimum wages, sector medians), classification heuristics (e.g., payment-mode inferred from transaction text). Correct as decision-support; **rates need periodic gazette updates**.
- 🟡 **Simulated (123 markers):** connector "syncs," some automation runs (no live cron/integration — evaluated against current data on demand), webhook registry (`hooks.example.com` placeholder).
- 🔴 **Preview / not buildable today (210 markers):** Tokens (e-Rupee/CBDC, tokenized invoices, atomic settlement) and Frontier (autonomous treasury, machine-to-machine pay, quantum-safe, streaming payroll). **Clearly labelled in-UI as forward-looking** — must stay labelled in any external material.
- ⚙️ **External dependencies:** `api.qrserver.com` (renders UPI QR images — a third-party image call), `wa.me`/`api.whatsapp.com` (deep links), `rzp.io`/`g.page` (links). The QR dependency is a minor privacy/availability consideration (the UPI string is sent to a third-party image service).

---

## 7. Risks & gaps (prioritized)

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| 1 | 🔴 High | **Test coverage:** 47 tests / 4 files cover only `lib/` math. ~1,465 UI tools and 148 routes have **no automated functional tests**. | Add smoke/render tests per page + API contract tests; target the money-touching modules first (invoices, payments, payroll, GST, credit). |
| 2 | 🔴 High | **No on-device QA:** everything is build-verified only; iOS install still pending; inner pages never click-tested on a real phone. | Complete the iOS install; run a manual pass on the top 15 modules on iPhone + the M31. |
| 3 | 🟡 Med | **Mega-files:** 5 pages >3,800 lines (Payroll 4,842, GST 4,393, Operations 4,327, Credit 4,070, Analytics 3,885). Hard to review/maintain; risk of merge pain. | Extract each tool into its own file under `features/<x>/tools/`; keep the page as a thin registry. |
| 4 | 🟡 Med | **Dual backend** (Node live + Django host in env). | Confirm canonical backend; delete dead env/refs; document. |
| 5 | 🟡 Med | **Over-promise risk:** preview/simulated modules could be mistaken for live. | Keep "preview" labels; gate Tokens/Frontier behind a clearly-marked "Labs" flag. |
| 6 | 🟡 Med | **Indicative rates drift:** hardcoded statutory rates/bands will age. | Centralise rate tables with an "as-of FY" stamp + update cadence. |
| 7 | 🟢 Low | **Role grants** for ~20 newest modules limited to owner/super_admin. | Review and extend to finance/sales/ops where relevant. |
| 8 | 🟢 Low | **External QR/image dependency** sends UPI string to a 3rd-party renderer. | Generate QR client-side (e.g., a local QR lib) to avoid the round-trip. |
| 9 | 🟢 Low | **Bundle size** warnings (chunks >500 kB; xlsx/exporters heavy). | Already code-split; consider lazy-loading export libs. |

---

## 8. Compliance & security posture

- **Access control:** 🟢 role-based, enforced at route-guard + context layers; read-only and advisor-client write-gating present.
- **Multi-tenancy:** 🟢 KV store is tenant + namespace scoped (`UNIQUE(tenant_id, namespace, key)`).
- **Payments:** 🟢 Razorpay webhook verifies HMAC against raw request bytes (correct pattern).
- **Privacy/DPDP:** 🟡 the app ships a *Privacy/Consent module* (consent registers, DSAR, RoPA) — useful for the SMB's own compliance, but that's a **feature**, not a substitute for Headroom's own DPDP posture (data processing agreements, the QR third-party call, retention). Recommend a separate platform-level DPDP review.
- **Money rails / KYC:** 🟡 schemas exist (disbursement, EWA, BNPL) and Razorpay is wired for collections/billing, but **lending disbursement & KYC flows appear schema-level** — verify before claiming live lending.

---

## 9. Limitations of this audit

- **Automated + static**, not a manual exercise of all 1,465 tools — individual tool correctness (formulae, edge cases) was **not** unit-verified beyond the 47 existing tests.
- Backend behaviour assessed by **route inventory and schema**, not by running the server against a live DB.
- "Backend-backed" flags are inferred from route-group names; some modules may share generic routes (KV/notes/files).

---

## 10. Verdict

**Headroom is a genuinely vast, build-healthy, India-deep SMB finance platform with a coherent role model and a real (if narrower) integrated core.** Its strengths are breadth, India-specific correctness, and a working sync/persistence backbone. Its gaps are classic for a fast, broad build: **thin automated test coverage, oversized files, no on-device QA, and a meaningful preview/indicative fraction that must be honestly labelled.** None are architectural dead-ends; all are addressable with focused hardening — starting with tests on the money-touching modules and completing on-device QA.

*Prepared from the working tree at audit date. Re-run §2 commands to refresh the evidence.*
