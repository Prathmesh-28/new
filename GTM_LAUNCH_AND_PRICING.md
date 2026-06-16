# Headroom — Launch Readiness + Competitive Pricing Strategy

*Prepared as head-of-marketing + pricing strategist. All competitor prices researched on the web (June 2026), cited with source; **all INR, exclusive of 18% GST** unless noted; Indian SaaS convention is ex-GST + annual ≈ 2 months free.*

---

## PART A — "Can I launch with payments right now?" → **No, not for real revenue yet. ~1–2 days of wiring away.**

The payment *plumbing exists and is well-built*, but it is **not production-ready**. Evidence from the code:

| Check | Status | Detail |
|---|---|---|
| Razorpay checkout wired | 🟢 Yes | `src/lib/billing.ts` loads `checkout.razorpay.com`, creates an order, backend verifies the signature server-side, then `applyPlan()` writes to `tenant_billing` + `users`. Good bones. |
| Live keys | 🔴 **Test mode** | `backend/.env` is `# Razorpay (test mode)`. No real money moves until you swap to **live keys** on a KYC-approved Razorpay account. |
| Prices match your plan | 🔴 **Mismatch** | Backend `PLAN_PRICING` = **growth ₹999, pro ₹2,999**. Your stated plan = **Growth ₹2,499, Pro ₹5,999**. Code is wrong/stale. |
| Starter (₹799) checkout | 🔴 Missing | `VALID_PLANS = ["growth","pro"]` only — **Starter can't be purchased at all.** |
| Auto-renew / UPI Autopay | 🔴 Not wired | Code creates **one-time orders "per period"**, not Razorpay **Subscriptions / UPI Autopay mandates**. Your pricing page promises "UPI Autopay" + annual — recurring billing doesn't exist, so nothing auto-renews. |
| 14-day trial | 🔴 Not wired | Signup defaults plan to `"free"`; no trial start/expiry logic. Pricing page promises 14 days. |
| Founding-member 50% / annual math | 🔴 Not wired | No coupon or annual-vs-monthly amount logic in `billing.js`. |
| Plan-based feature gating | 🟡 **Likely missing** | Access is gated by **role** (`canAccess`), not by **plan**. So a Free user may still reach Growth/Pro modules → **no reason to pay.** Must enforce plan entitlements. |
| GST invoice on subscription | 🟡 Not seen | B2B India buyers need a GST invoice for the subscription itself. |

**Launch checklist (do these before charging ₹1):**
1. Swap to **live Razorpay keys** (needs a KYC-approved account).
2. Fix `PLAN_PRICING` to **799 / 2499 / 5999** and add **Starter** to `VALID_PLANS`.
3. Wire **Razorpay Subscriptions + UPI Autopay mandate** for true auto-renew (monthly + annual).
4. Add **14-day trial** state (start at signup, expiry → paywall) and the **founding-member 50%/12-mo** coupon.
5. **Gate features by plan** (entitlements), else upgrades have no teeth. Issue a **GST invoice** on each charge.

Everything else for launch (the product, 1,564 tools, web/Android live, responsive) is in good shape — payments is the one true blocker.

---

## PART 1 — Competitive landscape (cited, June 2026)

| Competitor | What it really is | Entry price | Top SMB tier | Model |
|---|---|---|---|---|
| **Zoho Books** | Cloud accounting + GST | Free; **Standard ₹899/mo** (₹749 annual) | Premium ₹2,999 → Elite ₹5,999 → Ultimate ₹9,999 | Per-**org**/mo, annual ≈ −17%; users +₹150–180 ([Patron, 2026](https://www.patronaccounting.com/blog/zoho-books-pricing-india-2026), [GoForFiling](https://goforfiling.com/zoho-books-pricing-india/)) |
| **TallyPrime** | On-prem accounting (incumbent) | **Silver ₹22,500** perpetual | Gold ₹67,500 (multi-user) + TSS ₹4,500–13,500/yr | **Perpetual** + annual TSS; not subscription ([Mark IT, 2026](https://www.markitsolutions.in/product/tally-prime), [Antraweb](https://www.antraweb.com/tallyprime-pricing)) |
| **Vyapar** | Mobile-first billing/GST | **Mobile ~₹942/yr** | Desktop ~₹3,399–4,353/yr; POS ~₹9,557/yr | Per-**device**/yr ([Techjockey, 2026](https://www.techjockey.com/detail/vyapar), [ITQlick](https://www.itqlick.com/vyapar/pricing)) |
| **myBillBook** | Mobile billing | **from ₹399/yr** | tailored | Annual ([mybillbook, 2026](https://mybillbook.in/pricing-plans), [Techjockey](https://www.techjockey.com/detail/mybillbook-accounting-software)) |
| **Refrens** | Invoicing + light CRM | Free (15 docs/yr) | **~₹1,999/yr** (Accounting/CRM) | Per-business/yr ([Capterra, 2026](https://www.capterra.com/p/204191/Refrens/pricing/), [SoftwareSuggest](https://www.softwaresuggest.com/refrens)) |
| **ClearTax GST** | GST/TDS filing (CA-grade) | **~₹45,000+/yr**, sales-led | Expert packs (300 GSTINs) | Annual, contact-sales ([Techjockey, 2026](https://www.techjockey.com/detail/cleartax-gst-software), [xpay](https://www.xpay.sh/saas-pricing/cleartax-gst-software/)) |
| **Zoho Payroll** | Payroll | Free (≤10 emp); **Standard ₹1,000/mo** (25 emp) | Professional ₹3,000/mo; Premium ₹4,000 | Base + ₹40–80/emp; ~₹50–60/emp ([GoForFiling, 2026](https://goforfiling.com/zoho-payroll-india-pricing/)) |
| **RazorpayX Payroll** | Payroll + payouts | **~₹100/emp/mo** | volume custom | Per-emp/mo ([Techjockey, 2026](https://www.techjockey.com/detail/razorpayx), [SoftwareSuggest](https://www.softwaresuggest.com/razorpayx-payroll)) |
| **greytHR** | HR + payroll | Free (≤25 emp); **Essential ~₹2,495–3,495/mo** | Growth ~₹4,495–5,495/mo | Base + ₹35–45/emp >50 ([G2, 2026](https://www.g2.com/products/greythr/pricing), [HRSuggest](https://www.hrsuggest.com/resources/greythr-pricing-india-march-2026)) |
| **Keka** | HRMS + payroll | **₹99/emp/mo** (₹89 annual) | ₹9,999–15,999 / 100 emp/mo | Per-emp, 25-emp floor ([Research.com, 2026](https://research.com/software/reviews/keka), [HRSuggest](https://www.hrsuggest.com/resources/keka-pricing-india-march-2026)) |
| **RazorpayX** | Neobank / banking-API | **Free current a/c** | payouts ₹2–5 each; card fee ≤₹1,499 | Transaction-led ([Happay, 2026](https://happay.com/blog/razorpayx-reviews-pricing/), [productgrowth](https://productgrowth.in/tools/banking-api/razorpay-x/)) |
| **Open** | SME neobank (3M+ biz) | Freemium, **price not public** | custom | Transaction/credit-led ([Tracxn, 2026](https://tracxn.com/d/companies/open/__Tivm52sBRTc3OmMupMjS0b0Y_UNU8ragd5vCrnOHqzY), [BankBazaar](https://www.bankbazaar.com/banks/list-of-neobanks-in-india.html)) |
| **Cube** (AI cash-forecast) | FP&A/forecasting | **$20K+/yr** (≈₹17L) | enterprise | Not SMB ([Cube, 2026](https://www.cubesoftware.com/blog/best-cash-forecasting-software)) |
| **Growfin / CashFlo** (AR/collections) | AR collections automation | **Custom/sales-led**, enterprise | enterprise | No public SMB price ([Capterra, 2026](https://www.capterra.com/p/250264/Growfin/), [Gartner](https://www.gartner.com/reviews/product/cashflo-1)) |
| **Indifi / FlexiLoans** (SMB lending) | NBFC/embedded credit | **1–1.5%/mo** (≈15–24% APR) + ≤3% fee | — | Lending take-rate, not SaaS ([FlexiLoans, 2026](https://flexiloans.com/blog/msme-loan-interest-rates/), [BuddyLoan](https://www.buddyloan.com/indifi-business-loan)) |

**Competitors you may have missed:** Giddh, Munim, Busy (accounting); Kredily, Pazcare (free payroll/benefits); Cashbook/Khatabook (ledger); Sleek/RazorpayX (compliance); KredX/Recur Club (revenue-based finance). None change the core picture.

---

## PART 2 — "What an SMB pays today" (your value wedge)

A ₹2–25Cr SMB stitching the same job from point tools, **per month, ex-GST**:

| Job | Typical tool today | ~Monthly cost |
|---|---|---|
| Accounting + GST | Zoho Books Premium (or Tally ₹22.5k upfront + TSS) | **₹2,999** |
| Payroll (say 15 staff) | Zoho Payroll Standard / RazorpayX | **₹1,000–1,500** |
| GST + TDS filing | ClearTax (~₹45k/yr) | **~₹3,750** |
| Collections / AR follow-up | *no cheap SMB tool — done manually* | ₹0 (but costs DSO) |
| Cash-flow forecast / AI CFO | *no SMB tool (Cube = $20k/yr)* | ₹0 (flying blind) |
| **Total fragmented stack** | 3–4 logins, no collections/forecast | **≈ ₹7,750–8,250/mo** |

**Headroom Growth = ₹2,499/mo** does invoicing + GST + payroll + **collections + cash-forecast + AI CFO** (the last two have *no* SMB competitor). **~3× cheaper than the stack, and does more.** That math is your entire ad.

---

## PART 3 — Per-feature pricing (where you have no cheap rival)

| Your capability | Who sells it standalone | Their price | In your plan |
|---|---|---|---|
| GST invoicing | Vyapar / myBillBook / Refrens / Zoho | ₹399–2,999/yr–mo | Free / Starter |
| GST + TDS filing | ClearTax | ~₹45k+/yr | Starter (prep) / Growth (full) |
| Payroll | Zoho / RazorpayX / Keka / greytHR | ₹50–100/emp or ₹1,000+/mo | Growth |
| **Collections / AR automation** | Growfin / CashFlo | **enterprise, no SMB price** | Starter/Growth → **WHITE SPACE** |
| **Cash-flow forecast / AI CFO** | Cube / Drivetrain | **$20k+/yr** | Growth → **WHITE SPACE** |
| Banking | RazorpayX / Open | free / txn-led | integrate, don't compete |
| **Embedded credit** | Indifi / FlexiLoans | lending take-rate | Pro → monetize via take-rate |

**Two categories — collections and AI-CFO/cash-forecast — have no cheap SMB competitor in India.** That is your real pricing power: you can attach them to Growth and nobody can undercut you on them.

---

## PART 4 — Recommended pricing ladder (KEEP vs CHANGE)

| Plan | Your price | Nearest rival | Their price | Verdict | Why |
|---|---|---|---|---|---|
| **Free ₹0** | ₹0 | Zoho Free / Refrens Free | ₹0 | **KEEP** | Acquisition. Tighten limits (see Part 7). |
| **Starter ₹799** | ₹799 | Zoho Standard ₹899 / Vyapar ~₹283/mo | ₹283–899 | **KEEP** (try ₹749) | Above pure billing apps, but you add collections + GSTR prep. Undercut Zoho Standard at ₹749 for a clean "less than Zoho, India-native collections." |
| **Growth ₹2,499** | ₹2,499 | Zoho Books Premium ₹2,999 (acctg only) | ₹2,999 | **KEEP now, raise later** | **Underpriced vs value** — it replaces Zoho Books ₹2,999 + Payroll ₹1,000 = ₹3,999 *and* adds collections + AI CFO. Brilliant land-grab at "less than Zoho's flagship, alone." Path to ₹2,999 once you have logos. |
| **Pro ₹5,999** | ₹5,999 | Zoho Elite ₹5,999 | ₹5,999 | **KEEP** | Matches Elite but adds credit/treasury/multi-entity. Real money is the **lending take-rate + seats**, not this fee. |
| **CA/Advisor ₹1,999/10 clients** | ₹1,999 | Tally+ClearTax stack | ₹22.5k + ₹45k/yr | **KEEP / lean in** | ₹200/client — deliberately cheap because the CA is your **viral distribution**. Add a **rev-share** option to align incentives. |
| Extra users ₹199/user | ₹199 | Zoho ₹150–180 | ₹150–180 | **TRIM to ₹149–179** | Slightly above Zoho; match it. |

**Truths you asked for:** Growth is your most **underpriced** tier (that's OK for a land-grab; raise to ₹2,999 at scale). Starter sits **above** ₹399–942/yr billing apps — you'll lose pure price-shoppers, but you're not selling a billing app, so **don't race Vyapar to the bottom.** Pro is fair but should be a clean anchor; monetize credit on take-rate.

---

## PART 5 — Feature matrix (Headroom vs top rivals)

| Capability | Headroom | Zoho (Books+Payroll) | TallyPrime | RazorpayX |
|---|---|---|---|---|
| GST invoicing | ✓ | ✓ | ✓ | ✗ |
| GST + TDS filing | ✓ | limit (Books does GST; TDS partial) | limit | ✗ |
| Payroll | ✓ (Growth) | ✓ (separate ₹1,000+/mo) | limit (add-on) | ✓ (₹100/emp) |
| WhatsApp/UPI collections | ✓ | ✗ | ✗ | limit |
| AR / DSO automation | ✓ | ✗ | ✗ | ✗ |
| Cash-flow forecast | ✓ | ✗ | ✗ | ✗ |
| AI CFO brief | ✓ | ✗ | ✗ | ✗ |
| Embedded credit | ✓ (Pro) | ✗ | ✗ | limit (cards) |
| Cloud + mobile + offline | ✓ | ✓ | limit (on-prem) | ✓ |
| Price model | per-org SaaS | per-org + per-emp | perpetual ₹22.5k | txn-led |

---

## PART 6 — One-line positioning vs each rival

- **vs Zoho:** "Everything Zoho's top plan does — *plus payroll, collections and an AI CFO* — for **less than Zoho Books alone**."
- **vs TallyPrime:** "No ₹22,500 upfront, no desktop lock-in. Cloud books + auto-GST + get-paid tools for **₹2,499/mo, all-in.**"
- **vs Vyapar/myBillBook:** "They make an invoice. **We make the invoice get paid** — WhatsApp/UPI reminders, GST filing and cash forecast included."
- **vs ClearTax:** "GST filing *and* the invoicing, payroll and collections that feed it — one app, no ₹45k sales call."
- **vs RazorpayX/Open:** "Keep your bank. We're the **finance brain on top** — books, GST, payroll, forecast, collections — not just a current account."
- **vs Keka/greytHR/RazorpayX Payroll:** "Payroll is one tab here, not a separate ₹100/employee bill — bundled into your back office."

---

## PART 7 — 5 concrete pricing/packaging tweaks to drive free→paid

1. **Gate the two white-space hooks behind paid** — keep **Free = invoicing + dashboard only** (25 invoices, 1 GSTIN, 1 user). Put **WhatsApp/UPI collections + DSO behind Starter**, and **AI CFO + 90-day cash forecast behind Growth.** Those are the "aha" features *no competitor offers cheaply* — they're your best converters, so don't give them away.
2. **Sell extra GSTINs as an add-on** (e.g. ₹299/GSTIN/mo). ₹2–25Cr SMBs grow by adding branches/entities — meter the thing that scales with their success.
3. **Make Growth the obvious default** — label it "Most chosen," anchor it at ₹2,499 *just under* Zoho Books-alone (₹2,999), and show the "₹7,750 stack → ₹2,499" math right on the card.
4. **Annual = 2 months free** (matches Zoho's ~17%) + **founding-member 50% off annual, locked 12 months, first 100 only** — real scarcity drives signups; cap it and show the counter.
5. **Monetize credit on take-rate, not subscription** — keep Pro a clean ₹5,999 anchor; earn on lending origination (the ₹20–25L-cr MSME credit gap), where Indifi/FlexiLoans charge 1–1.5%/mo. Bundle the *tools* free in Pro; earn when a loan actually disburses.

*Assumptions: competitor prices are 2026 public/list, ex-18% GST; "stack" math uses mid-tier comparable plans; your prices as you stated them (799/2499/5999) — note the code currently says 999/2999, which Part A flags to fix.*
