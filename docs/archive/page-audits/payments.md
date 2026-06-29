## Payments & UPI (`/payments`) — 32 tools

Collect over UPI/cards, build links, track autopay & NACH mandates, reconcile settlements/UTRs/reserves, model MDR/gateway cost, and watch success rate — India-first money movement. Stakeholders: owner, finance, sales. Backend: partial (Razorpay webhook/billing); rest KV (per-feature `useFeatureState` keys) or pure compute.

- **Overview** — reads `store.transactions` (this-month inbound), `pay-mandates`, `pay-refunds` → derives collected-this-month, active mandate count + monthly-capped value, pending refunds & value, a hardcoded "~0.9%" blended MDR card; jump buttons to other tabs → 4 KPI cards + quick-action grid. _Persist: reads pay-mandates, pay-refunds (live store); collected proxied from store.transactions._ _Class: Indicative (blended MDR is a literal; collected is a revenue proxy, not real settlements)._

- **UPI QR / Intent** — inputs payee VPA (pa, regex-validated `name@bank`), payee name (pn, defaults firm name), amount (am, blank = open), ref/order id (tr, "Auto" fills `HDM`+timestamp), note (tn) → builds standard `upi://pay?` URI (cu=INR, am to 2dp) → renders scannable QR, copyable link, "Open in UPI app" anchor, share-text. _Persist: none._ _Class: Backend (open NPCI UPI spec, no gateway)._ External call: image GET to `api.qrserver.com/v1/create-qr-code`.

- **Payment Links** — inputs title, base amount, GST % (default firm.gstRate/18), include-GST & allow-partial toggles, expiry days (→ expiry date), payee VPA → computes GST (rounded), total, expiry date; builds a `upi://pay` link (am=total) and a multi-line share-request text → preview card + copy + WhatsApp share. _Persist: none._ _Class: Backend (UPI intent) + Preview._ External call: `wa.me/?text=` share.

- **AutoPay Mandates** — inputs customer, cap ₹, frequency (monthly/quarterly/yearly/as-presented), rail (upi-autopay/enach/card-si), next debit date → adds active mandate row; cycle button toggles active→paused→revoked; computes active count, monthly-equivalent value (freq factor), days-to-debit with overdue/≤3d styling → KPI cards + sortable table. _Persist: `pay-mandates`._ _Class: KV._

- **MDR / Surcharge** — inputs amount, method (upi/rupay-debit/debit/credit/amex/netbanking/wallet), pass-on toggle → applies indicative rate table (UPI 0%, RuPay 0%, debit 0.9%, credit 2%, amex 3%, netbanking 1%, wallet 1.5%) + 18% GST on fee → MDR fee, GST, total cost, you-net or customer-pays, plus a "steer to UPI saves X" banner. _Persist: none._ _Class: Indicative (rates are market estimates, not contracted)._

- **Settlement Recon** — inputs settlement date, gross sales, MDR %, payout received → expected payout = gross − fee − 18% GST on fee; variance = received − expected, matched if |var|<₹1 → KPI cards (batches, unmatched, net variance) + table with red-highlighted mismatches. _Persist: `pay-settlements`._ _Class: KV._

- **Refund Tracker** — inputs customer, order ref, amount, reason → logs pending refund (dated); mark refunded/reject/remove; computes pending vs processed sums, ageing (>5d pending highlighted) → KPI cards + table. _Persist: `pay-refunds`._ _Class: KV._

- **Split Payment** — inputs total captured + N parts (name, percent|fixed, value) defaulting to 10% commission / 90% seller; add/remove parts → per-party share (percent of total or min(fixed,total)), allocated sum, unallocated remainder (green if ~0) → breakdown card. _Persist: none (component useState)._ _Class: Indicative._

- **Success Rate** — inputs method, outcome (success/failed), amount, decline reason (from fixed list, only when failed) → records attempt (timestamped); computes overall success rate, attempts, revenue captured vs at-risk, per-method success bars, top-decline ranking → KPI cards + bar charts. _Persist: `pay-attempts`._ _Class: KV._

- **Collect Request** — inputs customer name, 10-digit mobile (normalized to 91-prefixed, validated), amount, due-in days (→ due date), reference, your VPA → composes a WhatsApp message with embedded `upi://pay` link → preview + "Send on WhatsApp" + copy. _Persist: none._ _Class: Backend (UPI intent) + Preview._ External call: `wa.me/<phone>?text=`.

- **Method Mix** — reads `pay-attempts` (successful) else falls back to inferring a mix from `store.transactions` bucketed by amount band (≤₹2k UPI / ≤₹50k Cards-UPI / NEFT) → per-method count, value, % share → stacked bar + legend + total. _Persist: reads pay-attempts (live store); else transaction-band heuristic._ _Class: Indicative (inference path) / KV (attempts path)._

- **AutoPay Calc** — inputs charge/cycle, frequency (weekly/monthly/quarterly/yearly), cap headroom % → recommended cap = ceil(charge×(1+buffer)/10)×10, annual value, debits/year, PIN-less (≤₹15k) vs step-up flag, next 4 debit dates with 24h pre-debit notice dates. _Persist: none._ _Class: Indicative (NPCI ₹15k rule applied)._

- **Bulk Payout** — inputs beneficiary, account no, IFSC (regex-validated), amount → adds payee row; detects duplicate account numbers; computes total + dup count → KPI cards + table + CSV export (`beneficiary_name,account_number,ifsc,amount,narration`) via Blob download. _Persist: `pay-bulk-payees`._ _Class: KV (+ client CSV export, no transfer executed)._

- **Reminder Plan** — inputs customer, amount, due date, channel (whatsapp/sms/email), cadence (once/3-day/weekly) → schedules reminder; mark paid/reopen; computes open count, overdue (due<today), outstanding sum, days-to-due styling → KPI cards + table. _Persist: `pay-reminders`._ _Class: KV (planning only; sending is manual via Collect Request)._

- **QR Batch** — inputs payee VPA, label prefix (default "Table"), count (1–50 clamped), optional fixed amount → generates per-label `upi://pay` URIs with label as tr reference → grid of scannable QRs + per-link copy + copy-all. _Persist: none._ _Class: Backend (UPI intent)._ External call: per-QR GET to `api.qrserver.com`.

- **Dispute Tracker** — inputs customer, order ref, disputed amount, evidence window days (→ deadline) → logs chargeback at "received"; stage transitions received→evidence-sent→won/lost; computes open count, amount-at-risk, win rate, days-left-to-deadline (lapsed if <0) → KPI cards + table. _Persist: `pay-disputes`._ _Class: KV._

- **EMI on Invoice** — inputs principal, tenure months, annual interest % (0 = no-cost), first-instalment date → reducing-balance EMI (or equal split at 0%), total payable/interest, dated amortization schedule (principal/interest/balance) + shareable plan text. _Persist: none._ _Class: Indicative (standard EMI math)._

- **Convenience Fee** — inputs target net ₹, fee %, flat fee, add-18%-GST toggle → gross-up solve `gross = (net + flat×gstMult)/(1 − pct×gstMult)` so net is preserved after fee+GST; outputs customer-pays, fee base, fee incl. GST, effective add-on %; warns if fee % too high (denom≤0). _Persist: none._ _Class: Indicative._

- **Settle Forecast** — inputs capture date, gross, instrument (upi T+1/0%, card T+2/1.8%, netbanking T+1/1%) → projects settlement date = capture + profile days, payout = gross − MDR − 18% GST; groups by settle date, sums upcoming payouts → KPI cards + settlement-calendar table. _Persist: `pay-forecast-sales`._ _Class: KV + Indicative (T+1/T+2 cycles & rates are estimates)._

- **Tip & Rounding** — inputs bill, tip mode (percent/fixed/none) + value (with 5/10/15/18% presets), round-up step (none/₹1/₹5/₹10) → tip, subtotal, round-up delta (ceil to step), customer-pays → itemized breakdown card. _Persist: none._ _Class: Indicative._

- **UTR Recon** — inputs UTR/RRN (regex 12–22 alnum), amount, side (expected-book / received-bank), note → matches expected vs received entries sharing a UTR into matched/missing/unexpected/mismatch (|diff|<₹1) → KPI cards + status-coded table. _Persist: `pay-utr`._ _Class: KV._

- **NACH Register** — inputs UMRN, customer, max debit ₹, frequency (monthly/quarterly/half-yearly/yearly/adhoc), mode (e-NACH/physical), sponsor & customer bank, valid-from/until → registers mandate as "pending"; approve/reject/cancel; computes active count, monthly-equiv value, expiring ≤30d → KPI cards + table. _Persist: `pay-nach`._ _Class: KV (register of record; distinct from live AutoPay tracker)._

- **Gateway Compare** — inputs monthly volume, txns/mo + editable gateway rows (name, MDR %, flat ₹, success %, settle days; seeded Razorpay/Cashfree/PhonePe) → per-gateway total cost (MDR + flat×n + 18% GST), realised GMV (×success%), effective cost % of realised GMV; tags cheapest & best-value → sortable table. _Persist: none (seeded useState)._ _Class: Indicative (seed rates illustrative)._

- **Dunning Ladder** — inputs ARPU/MRR, active subs, monthly fail % + editable retry steps (T+day, channel upi-autopay/whatsapp/sms/email/call, action; seeded 5-step ladder) → at-risk MRR = subs×fail%×MRR; waterfall applies per-channel recovery heuristics (autopay .35, call .4, wa .25, sms .15, email .1) sequentially → KPI cards + ladder waterfall + churn-risk remainder. _Persist: `pay-dunning`._ _Class: Simulated (recovery % are planning heuristics)._

- **Virtual Accounts** — input customer/cost-centre → deterministically derives a virtual account no (`firmSlug+custSlug+seq`), a collect VPA (`firm.cust@yesbank`), fixed IFSC `YESB0CMSNOC`; collision-checks; copy details/remove → table. _Persist: `pay-vaccounts`._ _Class: Simulated (synthetic credentials; "in production map to real CMS VA range")._

- **Payee Verify** — inputs expected payee, type (vpa name-check / bank penny-drop), identifier (VPA or account no), IFSC (bank only), name-at-bank → normalizes names (strips Pvt/Ltd/LLP/punctuation) and fuzzy-matches (equal or substring) → result verified / name-mismatch; logs check → KPI cards + table. _Persist: `pay-verify`._ _Class: Simulated (no real penny-drop/VPA API; name-at-bank is user-entered, match is local fuzzy)._

- **Instant Settle** — inputs settlement amount, instant-settle fee %, days brought forward, borrowing APR % → fee+18% GST, carry value = amt×APR×days/365, net benefit, breakeven APR (fee ÷ (amt×days/365)); worth-it verdict banner. _Persist: none._ _Class: Indicative (decision model)._

- **Duplicate Guard** — inputs customer, amount, order ref, date, tolerance window days → flags likely double-charges (identical non-empty ref, OR same customer + same amount within window); groups them, computes suspected-dupe count, duplicate exposure (extras beyond first per group), flagged value → KPI cards + per-group "refund" callouts + table. _Persist: `pay-dupe-entries`._ _Class: KV (heuristic match)._

- **Fee Tier Model** — inputs tier rows (volume ceiling ₹, rate % 0–5, dedup ceilings) + expected monthly volume → marginal slab pricing (each band charged only on volume inside it; overflow at top-band rate), per-band fee breakdown, total fee, blended MDR % → tier chips + breakdown. _Persist: `pay-feetiers`._ _Class: Indicative (slab math)._

- **Payment Allocation** — inputs open invoices (number, outstanding; dedup) + amount received + rule (oldest-first / pro-rata) → allocates pool oldest-first (min(pool,due) sequential) or pro-rata (min(due, recv×due/total)), computes applied + balance per invoice and any unapplied advance → invoice list + advance line. _Persist: `pay-alloc-invoices`._ _Class: Indicative (allocation math)._

- **Rolling Reserve** — inputs month, gross processed ₹, reserve % (0–100), hold months → held = gross×pct%, release month = month + hold; flags released when releaseMonth ≤ current month; computes currently-locked-up, releasing-this-month, months-tracked → KPI cards + held/released table. _Persist: `pay-reserves`._ _Class: KV + Indicative._

- **Method Downtime** — inputs method (UPI/Cards/Netbanking/Wallet/EMI), start datetime, minutes, failed txns, value lost → logs outage; computes total downtime minutes, total value lost, flakiest method (most cumulative minutes) → KPI cards + outage table. _Persist: `pay-downtime`._ _Class: KV._
