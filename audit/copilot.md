## AI CFO Copilot (`/copilot`) — 25 tools

An assistive layer over the workspace's live financial numbers: daily briefs, ranked recommendations, plain-language answers and planning aids — all computed locally from the user's own data. Stakeholders: owner, finance. Backend: NONE in this file — despite the brief's mention of `/api/ai`, `CopilotPage.tsx` makes zero network calls; every "AI" answer is rule-based pattern-matching over the in-memory `store` snapshot (`computeFinancialSnapshot`). Persistence is browser-local via `useFeatureState` (KV). HONEST NOTE: the page is explicitly assistive/preview — it never moves money, sends messages, or files anything; every "action" is a `navigate()` deep-link or a clipboard copy. The page banner says so verbatim.

Source: `src/features/copilot/CopilotPage.tsx`. Tools = the 25 entries in the `TABS` array (lines 30-56), each a rendered sub-component. UI filter/sort tokens (severity sort orders, horizon `7/14/30d` pickers, search keywords) are excluded as tools.

- **Overview** — `signals` snapshot → 4 KPI cards (cash, runway, overdue receivables, health score) + static "what the copilot does" cards + module deep-link chips → navigation hub. No computation beyond reading `signals`; the in-page cards navigate to `/copilot` (no-op) and the chips `navigate()` to other modules. _Persist: none._ _Class: Indicative (display) + Preview (links)._ Rule-based.

- **Daily CFO Brief** — `signals` → conditional plain-language lines (cash/runway, net-positive vs burn, overdue, due-today, 90-day obligations, customer concentration ≥30%) with tone dots → digest + "Copy brief" (clipboard) + deep-link to `/cfo-brief`. _Persist: none._ _Class: Indicative._ Rule-based (hand-written `if` thresholds); NOT AI.

- **Recommended Actions** — `buildRecs(signals)`: heuristic rules (overdue>0 → chase; runway<120 & burn → extend; expense>0 & burn → cut 10%; obligations90>cash → stress-test; topCustomer≥30% → diversify; DSCR<1.25 → improve coverage; else "nothing urgent"), sorted by severity then `impact` → ranked cards with CTA `navigate()`. _Persist: `cop-actions-dismissed` (string[] of handled ids, KV)._ _Class: Indicative + Preview._ Rule-based.

- **Quick-Action Launcher** — free-text `q` scored against a 12-entry `COMMANDS` keyword table (keyword substring match + label match bonus) → ranked matches; clicking toasts + `navigate()` to the module. Only navigates; does not perform the task. _Persist: none._ _Class: Preview._ Rule-based keyword matcher (NOT NL/AI).

- **Ask the Copilot** — question text → `answerQuestion(q, signals)`: regex pattern-match on topic (runway / cash-down / overdue / health / debt-DSCR / concentration / due-today; else help fallback) returns a templated sentence filled with `signals`. Logged in component state (in-memory, lost on unmount). _Persist: none._ _Class: Indicative._ RULE-BASED Q&A — NOT真 AI / NOT LLM-backed despite "Ask"/"Copilot" framing; grounded only in stored metrics.

- **Runway Goal Planner** — `targetMonths` slider (3-24) → `cashNeeded = target×burn`, `gap = needed − cash`, then heuristic split of gap across collect (≤ overdue), cut (≤10% expense × horizon), borrow (remainder) → suggested-plan rows with deep-link CTAs. Returns "net positive / no gap" states when burn≤0. _Persist: none (slider is local state)._ _Class: Simulated (heuristic plan) + Preview._ Rule-based.

- **Month-End Close** — `snap`+`store` → 5 auto-status checklist items computed live (uncategorised txns w/ blank counterparty, overdue receivables, draft POs, overdue obligations, GST net payable — last always "review") + 4 manual sign-off items (bank recon, depreciation, payroll, owner/CA) → progress %. Open links `navigate()`; nothing closes the books. _Persist: `cop-close-checklist` (string[] of ticked manual ids, KV)._ _Class: Indicative (auto) + KV (manual)._ Rule-based.

- **Explain a Number** — pick a metric (runway / gross margin / DSCR / cash-conversion-cycle / health) → shows value + plain-words formula + the input rows pulled from `snap` (e.g. health renders all 7 driver components) + "see detail" deep-link. Read-only; changes nothing. _Persist: none (selection is local state)._ _Class: Indicative._ Rule-based drill-down.

- **Payment Prioritizer** — obligations due ≤30d + approved/ordered POs (max 8), sorted overdue-first then by type urgency (tax<payroll<loan<other<supplier) then due-date; walks the list spending only `cash − reserve` → PAY NOW / PARTIAL / DEFER tags + shortfall → `/credit` link. Triage advice only; releases nothing. _Persist: `cop-pay-reserve` (number, KV)._ _Class: Simulated (greedy allocation) + Indicative._ Rule-based.

- **Due This Week** (ComplianceDigest) — horizon picker (7/14/30d) → obligations due ≤horizon + advance-tax installments in window, sorted by date, overdue flagged → list + total + "Copy digest" + `/compliance` link. Reminds only; filing happens elsewhere. _Persist: none (horizon is local state)._ _Class: Indicative._ Rule-based.

- **Top Risks** — `snap.health.components` scoring <60 (weighted by `(60−score)×weight`) plus acute signals (overdue, runway<90 & burn, obligations90>cash), deduped by title, top 3 → ranked cards with fix-page deep-link (uses each driver's `fixPath`/`fixLabel`). _Persist: none._ _Class: Indicative + Preview._ Rule-based.

- **Savings Finder** — last-90-day expense txns grouped by counterparty/description → monthly avg (total/3); keeps items that are recurring or ≥3 occurrences AND ≥₹5,000/mo, top 12; tick to tally earmarked monthly/annual saving. Cancels nothing. _Persist: `cop-savings-cut` (string[] of earmarked names, KV)._ _Class: Indicative + KV._ Rule-based grouping.

- **KPI Targets** — editable targets for 4 KPIs (runway months, gross margin %, DSO days, health score) compared to live actuals from `snap`/`signals` → met/gap badges + progress bars + reset. Actuals read-only. _Persist: `cop-kpi-targets` (KpiTargetState, KV)._ _Class: KV (targets) + Indicative (actuals)._ Rule-based.

- **End-of-Day Brief** — today's non-transfer txns → money in/out/net for the day + position (cash/runway/health) + open items (overdue, due-today, GST payable, runway<120 & burn) → copy-ready `<pre>` + clipboard. _Persist: none._ _Class: Indicative._ Rule-based.

- **Cash Early-Warning** — 8-week forward projection: opening cash + weekly operating run-rate (`monthlyNet/30 × 7`) + open invoices due in week − obligations due in week; flags first week closing < ~2-week expense buffer (`monthlyExpense × 0.5`) → per-week table + first-breach banner + collections/forecast links. Read-only forecast. _Persist: none._ _Class: Simulated (projection) + Indicative._ Rule-based.

- **Collect-First Worklist** — open (non-paid) invoices scored `amount × (1 + daysOverdue/30)`, top 12 → ranked tickable list + "still to chase" total + `/collections` link. Contacts no one. _Persist: `cop-collect-first-done` (string[] of ticked invoice ids, KV)._ _Class: Indicative + KV._ Rule-based ranking.

- **Invoice-Now Candidates** — delivered/dispatched orders with value >0, matched against existing invoice customer names; orders for an unbilled buyer flagged "likely unbilled", sorted unbilled-first then value, top 12 → list + likely-unbilled total + `/receivables` link. Raises nothing. _Persist: none._ _Class: Indicative._ Rule-based heuristic (name-match, not invoice-line match).

- **Pay Now vs Later** — window picker (3/7/14d) → obligations due ≤45d split into "pay now" (overdue, or due ≤window — note the rule collapses to `dueDate ≤ soon` for all types) vs "can wait"; totals vs cash; warns if pay-now exceeds cash → two columns + `/spend` link. Timing advice; releases nothing. _Persist: none (window is local state)._ _Class: Simulated (timing split) + Indicative._ Rule-based.

- **This Week** (ThisWeekFocus) — impact-ranked task list from signals: chase overdue, settle obligations due ≤7d, pay advance-tax due this week, review unbilled fulfilled orders, runway<120 & burn, DSCR<1.25; else "nothing pressing"; top 6 → tickable list + "Copy list" + per-task deep-links. To-do list, not an executor. _Persist: `cop-this-week-done` (string[] of ticked task ids, KV)._ _Class: Indicative + KV._ Rule-based.

- **Off-Track KPI** (KpiOffTrackExplainer) — reads saved `cop-kpi-targets`, compares 4 KPIs to live values, picks the one with the largest `gapPct` off-track → now/target/gap cards + canned "why" text + lever buttons deep-linking to fix pages. Diagnosis only. _Persist: reads `cop-kpi-targets` (KV, shared w/ KPI Targets); writes none._ _Class: Indicative + Preview._ Rule-based (pre-written explanations, not generated).

- **Attention Feed** — heuristic anomaly/risk detections (runway<90 & burn; overdue; due-today; expense spike = max outflow >3× median when ≥4 expenses; concentration ≥30%; DSCR<1.25), severity-sorted → cards with "Investigate" deep-link. _Persist: none._ _Class: Indicative + Preview._ Rule-based.

- **Guardrails & Limits** — editable policy: per-action limit, daily limit, approval-over threshold, allowlist-only toggle, quiet-hours toggle → saved config + summary cards + reset. EXPLICITLY non-enforcing: banner states nothing enforces them automatically; they only document boundaries for hypothetical future automation. _Persist: `cop-guardrails` (Guardrails, KV)._ _Class: KV (stored policy, no effect)._ Config only.

- **Autopilot Toggles** — 5 boolean toggles (daily brief, collections nudges, spend watch, compliance radar, forecast refresh) → stored on/off prefs. EXPLICITLY simulated: banner states none move money, send messages, or file anything; they only record which assists the user would want. _Persist: `cop-autopilot` (AutopilotState, KV)._ _Class: Simulated / Preview (toggles drive nothing)._ Config only.

- **Action Log** — manual free-text entries timestamped on add → user's own assistive audit trail; removable rows. No auto-capture — purely what the user types. _Persist: `cop-audit-log` (LogEntry[], KV)._ _Class: KV._ Manual log.

- **Weekly Review** — `signals` → auto-generated wins / watch-outs summary (net-positive, no-overdue, healthy DSCR, strong health vs overdue, burn, runway<120, concentration, 90-day obligations) → copy-ready `<pre>` + clipboard. _Persist: none._ _Class: Indicative._ Rule-based.

### Honest classification summary
- **真 AI-backed (LLM):** NONE. The "Ask the Copilot" and "Quick-Action Launcher" tabs imply NL/AI but are regex/keyword rule engines. No `/api/ai` call exists in this file.
- **Rule-based (live data, deterministic):** all 25 tools compute from `store`/`snap`/`signals`.
- **Simulated/heuristic projections:** Runway Goal Planner, Payment Prioritizer, Cash Early-Warning, Pay Now vs Later (forward/allocation math from assumptions).
- **Stored-config only (no effect):** Guardrails (non-enforcing by design), Autopilot (simulated by design).
- **KV-persisted state:** actions-dismissed, close-checklist, pay-reserve, savings-cut, kpi-targets, collect-first-done, this-week-done, guardrails, autopilot, audit-log.
- **Preview/navigation:** every CTA is `navigate()` or clipboard — no money moves, no messages send, no filings happen. The page banner asserts this explicitly.
