## WhatsApp (`/whatsapp`) — 22 tools

Turn WhatsApp into the SMB's billing/collections/marketing channel: a connect-and-alerts hub plus 21 message-composer tools that build customer-ready text and fire it via `wa.me` deep-links. Stakeholders: owner, sales, finance. Backend: `/api/whatsapp` (send-otp, verify-otp, register DELETE) + a 9 AM morning-brief digest cron driven by KV prefs; webhook-style chat commands (CASH/FORECAST/etc.) are documented in the UI but no inbound webhook handler is exercised from this page. NOTE: connect/OTP/disconnect and alert prefs are the only **real backend / KV-persisted** surface; every "Send" action across the 21 composer tools is a **wa.me deep-link** (opens WhatsApp with text pre-filled — nothing is sent server-side, no delivery, no read receipts); the chat mockup and digest are **preview-only**.

Tabs (23 buttons): Overview + 22 tool tabs. The list below is the 22 tools (Overview = connect hub; 21 composers).

- **Overview / Connect hub** — inputs: 10-digit phone → `POST /api/whatsapp/send-otp` (e164 `+91…`), 6-digit OTP → `POST /api/whatsapp/verify-otp`; Disconnect → `DELETE /api/whatsapp/register`. Alert-preference toggles (low_cash, overdue, gst_due, credit_offer, payroll, weekly) gated by `canEdit()`; chat-command copy buttons; an animated 3-step chat mockup (DigestBubble → FORECAST reply → forecast response, hard-coded). Output: connected state, OTP toasts, prefs that feed the server morning brief. _Persist: live backend (OTP/register) + KV store (`whatsappPreferences`, merged over `DEFAULT_WA_PREFS`)._ _Class: Backend (connect/alerts) + Preview (chat mockup, digest, stats 94%/<30s/80%)._

- **Invoice & Pay** (#177) — inputs: pick an open invoice (from `store.invoices`), optional customer WA number, optional pay-link URL → builds a branded invoice message (customer, #, amount, due, description, pay-link, "reply PAID") → preview + Send. _Persist: reads KV `invoices`; tool keeps no own state._ _Class: Indicative (wa.me deep-link; pay-link is just pasted text, no real payment rail)._

- **Reminder Bot** (#178) — inputs: none (auto-derives overdue invoices: `status==="overdue"` or pending+past-due) → dunning ladder D+1 gentle / D+7 firm / D+15 final-notice by computed days overdue, sorted, with totals → per-row "Remind" send. _Persist: reads KV `invoices`._ _Class: Indicative (wa.me deep-link per row; "auto-staged" is computed, not auto-sent)._

- **Sales Capture** (#179) — inputs: customer (default "Walk-in"), item/note, amount → books a dated sale row; today/all-time totals; per-row delete; "Send recap to my WhatsApp" of latest 10. _Persist: live store via `useFeatureState("wa-sales-capture")`._ _Class: KV (data) + Indicative (recap send is wa.me)._

- **Statement** (#180) — inputs: pick a customer (derived from invoices), optional WA number → builds a statement-of-account ledger (per-invoice lines, outstanding vs settled, "reply PAY/QUERY") → preview + Send. _Persist: reads KV `invoices`._ _Class: Indicative (wa.me deep-link)._

- **Approvals** (#181) — inputs: type (payment/invoice/expense), reference, amount, requested-by → queues an approval item; pending count/value; per-row Send request (wa.me, "reply YES/NO REF") and manual Approve/Reject buttons that set local status. _Persist: live store via `useFeatureState("wa-approvals")`._ _Class: KV (queue + status) + Indicative (send is wa.me; YES/NO is recorded manually, no inbound parsing)._

- **Broadcast** (#182) — inputs: segment (all / outstanding / fully-paid, customers rolled up from invoices), message body with `{name}` merge → per-recipient personalised message; sent/remaining counters; per-row Send marks sent locally. _Persist: reads KV `invoices`; `sent` map is component state only (not persisted)._ _Class: Indicative (one-at-a-time wa.me deep-links, explicitly "no bulk-send backend")._

- **Order Status** (#183) — inputs: customer, order ref, stage (confirmed/packed/shipped/delivered), optional ETA, optional WA number → emoji status-update message → preview + Send. _Persist: none._ _Class: Indicative (wa.me deep-link)._

- **Pay Receipt** (Payment-Confirmation #184) — inputs: optional open invoice (auto-fills amount/customer/#) or manual amount, mode (UPI/Bank/Cash/Cheque/Card), optional ref/UTR, optional WA number → branded "payment received" receipt → preview + Send. _Persist: reads KV `invoices`; does NOT mark the invoice paid._ _Class: Indicative (wa.me deep-link; receipt only, no ledger update despite header comment)._

- **Festive Offer** (#185) — inputs: festival (6 presets w/ greeting), offer text, promo code (upper-cased), optional valid-till → festive greeting + promo message → preview + Send + Copy. _Persist: none._ _Class: Indicative (wa.me deep-link) + Preview/Copy._

- **Price List** (Catalog #186) — inputs: add items (name, price, optional unit) to a saved list; optional WA number → builds a full price-list message (incl. firm GSTIN if set) → table + preview + Share; per-row delete. _Persist: live store via `useFeatureState("wa-price-list")`._ _Class: KV (catalog) + Indicative (share is wa.me)._

- **Review Ask** (#187) — inputs: customer, optional review URL, optional WA number → 5-star feedback-request message (link or "reply 1–5") → preview + Send. _Persist: none._ _Class: Indicative (wa.me deep-link)._

- **Chat Link / QR** (#188) — inputs: your WA number (10+ digits), pre-filled greeting → builds a `wa.me` click-to-chat link + renders a printable QR via external `api.qrserver.com` image endpoint; Copy link / Test open / Open QR full size. _Persist: none._ _Class: Indicative (link generator) + relies on external QR service (live third-party image fetch, not Headroom backend)._

- **GST Invoice** (#189) — inputs: pick an invoice, inter-state checkbox, optional WA number → treats amount as GST-inclusive, backs out taxable value and CGST/SGST (or IGST) split from `firm.gstRate` (default 18) → tax-breakup invoice message + summary cards → preview + Send. _Persist: reads KV `invoices` + `firm`._ _Class: Indicative (wa.me deep-link; client-side tax math, warns if no GSTIN)._

- **COD Confirm** (#190) — inputs: customer, order ref, COD amount, optional address/ETA, optional WA number → "keep exact cash ready" COD-confirmation message ("reply CONFIRM/CHANGE") → preview + Send. _Persist: none._ _Class: Indicative (wa.me deep-link)._

- **Service Reminder** (AMC #191) — inputs: add reminders (customer, service, due date, optional amount) → computes days-to-due, flags due ±30d, sorts; per-row Remind (wa.me, "reply RENEW") + delete. _Persist: live store via `useFeatureState("wa-service-reminders")`._ _Class: KV (tracked dates) + Indicative (remind is wa.me; no scheduled auto-send)._

- **Loyalty Points** (#192) — inputs: customer name, points delta, optional default WA number; Add / Redeem clamps at 0, upserts per-customer balance → totals; per-row Send balance (wa.me) + delete. _Persist: live store via `useFeatureState("wa-loyalty-members")`._ _Class: KV (balances) + Indicative (send is wa.me)._

- **Quick Replies** (#193) — inputs: title + body snippet with `{firm}` merge (seeded with 3 defaults: hours/payment/thanks), optional default WA number → saved snippet library cards; per-snippet Send (wa.me) / Copy / delete. _Persist: live store via `useFeatureState("wa-quick-replies", DEFAULT_SNIPPETS)`._ _Class: KV (library) + Indicative (send is wa.me)._

- **Product Launch** (#194) — inputs: product, optional tagline/price/launch-offer, optional WA number → launch announcement message ("reply INTERESTED") → preview + Send + Copy. _Persist: none._ _Class: Indicative (wa.me deep-link) + Copy._

- **Win-Back** (#195) — inputs: lapsed-after days (default 60), comeback offer → finds customers whose newest invoice is older than cutoff (from invoice history), shows last-seen + sent/remaining; per-row Win back marks sent locally. _Persist: reads KV `invoices`; `sent` map is component state only._ _Class: Indicative (wa.me deep-links; segment is computed)._

- **Appointment** (#196) — inputs: customer, purpose, date, optional time/location/WA number → appointment reminder ("reply CONFIRM/RESCHEDULE") → preview + Send. _Persist: none._ _Class: Indicative (wa.me deep-link)._

- **Referral Ask** (#197) — inputs: customer, referral reward (default "₹100 off for both of you"), optional referral link, optional WA number → referral-request message → preview + Send. _Persist: none._ _Class: Indicative (wa.me deep-link)._

### Persistence & class summary
- **Backend (live API):** connect flow only — send-otp, verify-otp, register DELETE; alert prefs feed the server morning brief.
- **KV (`useFeatureState`/store, synced across devices):** alert prefs (`whatsappPreferences`); Sales Capture, Approvals, Price List, Service Reminders, Loyalty Members, Quick Replies. Tools reading (not writing) KV `invoices`/`firm`: Invoice & Pay, Reminder Bot, Statement, Broadcast, Pay Receipt, GST Invoice, Win-Back.
- **Indicative (wa.me deep-link, no real send/delivery):** all 21 composer "Send/Remind/Share/Announce/Win back" actions — they open WhatsApp with pre-filled text only.
- **Preview-only:** Overview chat mockup, morning-digest bubble, and the 94% / <30s / 80% stat tiles.
- **External dependency:** Chat Link / QR renders via third-party `api.qrserver.com` (not Headroom infra). Pay-links and review/referral links are user-pasted strings — no payment or tracking rail is wired.
- **Note:** `component-state-only` send-tracking (`sent` maps in Broadcast & Win-Back) resets on reload — not persisted.
