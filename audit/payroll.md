# Payroll Module — Audit Appendix

## Payroll & Workforce (`/payroll`) — 45 tools

Runs monthly Indian SMB payroll end-to-end — employee master, run/disburse, statutory compliance (PF/ESI/PT/LWF/gratuity/bonus/TDS), salary structuring, separation, MIS, and a suite of HR planning calculators. Stakeholders: owner, finance, CA. Backend: `/api/payroll` (employees, runs, run, disburse) + `/api/ewa` + KV-synced `featureData` (via `useFeatureState`) for tracker/list tools.

The tab-selector array (line 226) defines **45 tabs**. `employees` and `runs` are the two backend-master tabs; the remaining 43 are statutory/HR tools. Plus there is one always-mounted modal (Add Employee) and the run/disburse actions in the page header. Each rendered tool is documented below; UI-state filter tokens (tab IDs themselves) are excluded.

---

### Core master & run (backend)

- **Add Employee (modal)** — captures name, email, PAN, gross_salary, joining_date, bank_account, IFSC → POSTs to `/api/payroll/employees`; live preview estimates monthly TDS from annual gross under the new regime (5% on 3–6L, 10% on 6–9L, 15% on 9–12L, 20% on 12–15L, 30% above 15L; no std deduction in preview) → persisted employee row. _Persist: Backend `/api/payroll/employees`._ _Class: Backend._

- **Employees** — lists every employee with gross, configured monthly TDS, derived net (gross − tds_monthly), and status badge; summary cards show active count, gross monthly, TDS monthly. Read-only table off the master. _Persist: Backend `/api/payroll/employees`._ _Class: Backend._

- **Payroll runs** — lists historical `/api/payroll/runs` with gross/TDS/net totals, draft/disbursed status, expandable per-employee breakdown. The header "Run … Payroll" button POSTs `/api/payroll/run` {run_month, run_year} (server computes the run); "Disburse" POSTs `/api/payroll/runs/:id/disburse`. _Persist: Backend `/api/payroll/runs` + `/run` + `/disburse`._ _Class: Backend._

- **EWA (Earned Wage Access)** — GETs `/api/ewa` (day-of-month, per-employee earned-to-date and max_advance = up to 50% of wages earned so far this month); "Request Advance" POSTs `/api/ewa/request` {employee_id, amount}, deducted from next salary. _Persist: Backend `/api/ewa` + `/api/ewa/request`._ _Class: Backend._ Carries a `PreviewBadge` (capability `ewaPayout`), so the payout rail is a preview.

---

### Compliance & document tools

- **Salary Slips** — per-employee/month slip: splits gross into Basic 50% / HRA 20% / Special 20% / Transport 10%; deducts PF = 12% of basic, Professional Tax = ₹200 if gross > ₹15,000 else 0, and the employee's configured monthly TDS → net = gross − (PF + PT + TDS); rendered as a printable card, exported to PDF via `exportElementAsPdf`. _Persist: none (derived from master; month/year are transient UI state)._ _Class: Indicative._

- **Form 16** — per-employee TDS certificate for a chosen FY: annualGross = gross×12, less ₹75,000 standard deduction → net taxable; new-regime slabs (0 ≤3L; 5% 3–7L; 10% 7–10L; 15% 10–12L; 20% 12–15L; 30% >15L), +4% health & education cess → annual TDS and monthly TDS. Part A (employer/employee/PAN/placeholder TAN "MUMB00000A") + Part B (income detail); downloads CSV. _Persist: none._ _Class: Indicative._ (TAN/TDS-deposit figures are illustrative.)

- **PF ECR** — EPFO Electronic Challan-cum-Return for active employees: pfWages = min(gross, ₹15,000); EE EPF = 12% of pfWages; EPS = min(8.33% of pfWages, ₹1,250); ER EPF diff = 12% − EPS; UANs are placeholders (`10000000000NN`). Totals footer; downloads fixed-width-style `.txt` ECR. _Persist: none (placeholder UANs, must be replaced before filing)._ _Class: Indicative._

- **ESI / Bonus (labor)** — three sub-panels in one tab:
  - **ESI Contributions** — for employees with gross ≤ ₹21,000: EE 0.75% + ER 3.25% of gross → monthly totals. _Class: Indicative._
  - **Payment of Bonus Act** — for employees gross ≤ ₹21,000: calc wage = min(gross, ₹7,000 ceiling); min bonus = calcWage×12×8.33%, max = calcWage×12×20% (annual). _Class: Indicative._
  - **Gratuity Provision** — 15/26 × monthly gross × years (per-year provision + 5-year illustration); notes ≥5 yr vesting and ₹20L cap. _Class: Indicative._
  - _Persist: none._

- **F&F Settlement (fnf)** — separation dues for one employee: per-day = gross ÷ 26; salary due = perDay × calendar days in last month; notice pay = perDay × notice days (zero if employer waives); leave encashment = perDay × leave-balance days; gratuity = (15/26) × gross × floor(years) only when service ≥5 yr (years derived from joining_date); gross settlement minus outstanding advance = net payable; downloads CSV. _Persist: none (inputs transient)._ _Class: Indicative._

- **Variance** — month-over-month payroll variance from `store.transactions` tagged category `payroll` (last 12 months): MoM change, %, trend badge (Spike >10% / Up / Down <−5% / Flat); avg/highest/lowest cards; >15% spike warning. _Persist: live store (`store.transactions`)._ _Class: Backend._ (Sources real ledger transactions, not statutory math.)

- **Prof. Tax (pt)** — state-wise PT slabs for 8 states (MH, KA, WB, TN, AP, TS, GJ, MP) with their actual graduated slab tables (e.g. MH ₹175 for 7.5–10k, ₹200 ≥10k; TN ₹208 ≥21k; KA ₹150/₹175/₹200 bands); computes per-employee monthly + annual PT; downloads CSV. _Persist: none._ _Class: Indicative._

- **Flexi Benefits (flexi)** — tax-efficient salary structuring (annual): basic = % of gross (slider 30–70), HRA = % of basic, LTA, food coupons (capped ₹2,200/mo ⇒ ₹26,400), employer NPS 80CCD(2) = % of basic, special allowance = balancing figure; HRA assumed 80% exempt (metro simplification), LTA/food/NPS fully tax-free; tax saving = total tax-free × 30% slab. _Persist: none (all sliders transient)._ _Class: Indicative._

- **LWF (lwf)** — Labour Welfare Fund per-employee/employer contributions for 12 states (e.g. MH ₹6+₹12 Jun&Dec, WB ₹3+₹6 monthly, Delhi/Rajasthan N/A); annualised by frequency (Monthly ×12, Jun&Dec ×2, Annual ×1) × headcount. _Persist: none._ _Class: Indicative._

- **Offer Letter (offer)** — generates a plain-text offer letter from candidate/designation/dept/joining/probation/location/reporting + gross; compensation split basic 50% / HRA 20% / special (balance) / annual CTC = gross×12; copy-to-clipboard. _Persist: none._ _Class: Indicative._

- **ESOP Pool (esop)** — stock-option pool & vesting tracker: pool size, FMV, strike (all KV); per grant vested = floor(granted × min(monthsElapsed, vestingYears×12) ÷ (vestingYears×12)), zero before cliff; notional = vested × max(0, FMV − strike); pool utilisation %, over-allocation warning. _Persist: KV — `esop-pool-size`, `esop-fmv`, `esop-strike`, `esop-grants`._ _Class: KV._

- **CTC Optimizer (ctc)** — old-regime tax-efficient annual CTC split: basic = % of CTC, HRA = 50%/40% of basic (metro toggle), employer NPS 80CCD(2) = min(pct,14)% of basic, employer EPF = 12% of min(basic, ₹1.8L), LTA = min(10% basic, ₹60k), food ₹26,400, special = balance; HRA exemption u/s 10(13A) = min(HRA, rent − 10% basic, 50/40% basic); tax-free total = HRA exempt + LTA + food + NPS. _Persist: none (inputs transient)._ _Class: Indicative._

- **Attendance (attendance)** — per-employee/month attendance register: payable days, present, LOP, comp-off, leave-encash days; per-day = gross ÷ payable days; LOP deduction = perDay × LOP; encash add-back = perDay × encash days; net = gross − LOP + encash; downloads CSV. _Persist: KV — `payroll-attendance`._ _Class: KV._

- **Gratuity (gratuity)** — Payment of Gratuity Act 1972 accrual: basic+DA proxy = 50% of gross; service years from joining_date with >6-months-rounds-up rule; accrued = min(₹20L cap, (15/26) × basic × eligible years); per-year accrual cost; vested flag at ≥5 yr; growth-assumption slider; downloads CSV. _Persist: none (rows derived from master; only the slider is local state)._ _Class: Indicative._

- **Reimbursements (reimburse)** — expense-claim workflow: submit (employee, date, category, amount, description), approve/reject status, pending/approved totals to merge into payroll; remove claims. _Persist: KV — `payroll-reimbursements`._ _Class: KV._

- **TDS u/s 192 (tds192)** — per-employee salary-TDS projection with regime toggle: annualGross = gross×12; new regime std deduction ₹75k (no other), old regime ₹50k + 80C (≤1.5L) + 80D (≤50k) + 80CCD(1B) (≤50k) + home-loan 24(b) (≤2L) + HRA exemption; slab tax via shared `computeSlabTax` (NEW or OLD bands); 87A rebate (new: full ≤7L; old: ≤₹12,500 up to 5L); +4% cess → annual TDS; even-monthly and balance-over-remaining-months figures. _Persist: none (inputs transient)._ _Class: Indicative._ (Surcharge >₹50L not modelled.)

- **Bonus Accrual (bonus)** — Payment of Bonus Act 1965: eligible if gross ≤ ₹21,000; calc wage = min(gross, ₹7,000); annual min = calcWage×12×8.33%, max = ×20%, declared = ×clamp(pct,8.33,20)%; declared-rate slider; per-employee register + totals; downloads CSV. _Persist: none (only slider local)._ _Class: Indicative._

- **Contractor Payouts (contractor)** — vendor/gig TDS register (separate from salary): rate = 1% (194C) / 10% (194J), or 20% if no valid PAN (regex-validated); TDS applied only when gross ≥ ₹30,000 threshold; net = gross − TDS; totals; downloads CSV labelled "26Q feed". _Persist: KV — `payroll-contractor-payouts`._ _Class: KV._

- **Salary Benchmark (benchmark)** — illustrative market annual-CTC bands (p25/p50/p75) for 9 SMB roles × city cost-of-living factor (Bengaluru 1.15 … Tier-2/3 0.80); positions an employee's CTC vs adjusted band, gap-to-median and suggested monthly correction. _Persist: none._ _Class: Indicative._ (Static illustrative medians — explicitly "not a live market feed.")

- **Appraisal Planner (appraisal)** — increment-cycle planner: total hike budget = % of current annual payroll; per-employee editable hike %, hike amount, new annual; allocated vs remaining/over-budget; "distribute evenly"; downloads CSV. Hikes do NOT auto-apply to live salaries. _Persist: KV — `payroll-appraisal-hikes` (budget % slider is local)._ _Class: KV._

- **Payroll Journal (journal)** — month-end GL voucher for active employees: salary expense (Dr) = gross + employer PF (12% of min(gross,15k)) + employer ESI (3.25% if gross ≤21k); credits = net payable, PF payable (EE+ER), ESI payable, PT (₹200/₹175/0 by gross), TDS; checks Dr=Cr balance; downloads CSV. _Persist: none (derived from master)._ _Class: Indicative._

- **Headcount Cost (headcount)** — 12-month fully-loaded forecast: loaded = (base gross + planned-hire CTC active that month) × 1.18 (employer PF+ESI+gratuity+bonus proxy); add planned hires with start month; monthly projection + 12-month total; downloads CSV. _Persist: KV — `payroll-planned-hires`._ _Class: KV._

- **Statutory Liability (liability)** — balance-sheet provisions: per-employee min statutory bonus (8.33% of min(gross,7k)×12, eligible if gross ≤21k) + leave-encashment = (gross ÷ 26) × avg accrued-leave days (slider); totals; downloads CSV. _Persist: none (slider local)._ _Class: Indicative._

- **Payslip Portal (portal)** — self-service distribution: builds per-employee tokenised payslip link (`portal.headroom.in/payslip/<base64>` — illustrative), composes WhatsApp (`wa.me`) or email (`mailto:`) message with net pay, tracks per-employee IT-declaration submitted/pending. _Persist: KV — `payroll-it-declarations` (month/channel local)._ _Class: Preview._ (Portal links are illustrative tokens; opens compose windows, no backend send.)

- **Overtime & Shift (overtime)** — Factories Act §59: basic+DA proxy = 50% gross; ordinary hourly = basicDA ÷ monthly hours; OT rate = 2× ordinary; OT pay = OT rate × OT hours; night-shift pay = shifts × allowance; total additional to add to gross. _Persist: none (inputs transient)._ _Class: Indicative._

- **Leave Encashment (leave-encash)** — per-employee earned/availed leave; balance = max(0, earned − availed); per-day = (basic+DA 50%) ÷ 26; encashment = perDay × balance; notes §10(10AA) ₹25L lifetime exemption cap. _Persist: KV — `payroll-leave-balances`._ _Class: KV._

- **Notice Recovery (notice)** — shortfall = max(0, required − served notice days); recovery base = gross or basic (50%) toggle; per-day = base ÷ 30; recovery/buyout = perDay × shortfall, netted against F&F. _Persist: none (inputs transient)._ _Class: Indicative._

- **Salary Advance (advance)** — interest-free advance/loan tracker: issue capped at 3× monthly gross; EMI = ceil(principal ÷ tenure months); record EMI repayments; outstanding/cleared status; total outstanding + monthly recovery. _Persist: KV — `payroll-salary-advances`._ _Class: KV._

- **NPS Optimizer (nps)** — employer NPS 80CCD(2): basic+DA annual = 50% of annual gross; cap 14% (new) / 10% (old); contribution = basicDA × capped%; tax saved = contribution × marginal slab rate (new-regime proxy) × 1.04 cess; monthly outflow. _Persist: none (inputs transient)._ _Class: Indicative._

- **Min-Wage Check (minwage)** — compares each gross against state minimum wage (8 states × Unskilled/SemiSkilled/Skilled, hardcoded ₹ figures) for chosen skill; flags shortfall and compliant/below-minimum status. _Persist: none._ _Class: Indicative._ (Rates explicitly "indicative", revised twice yearly.)

- **Maternity Benefit (maternity)** — Maternity Benefit Act (2017): avg daily wage = (gross×3) ÷ 90; entitlement 26 weeks (12 if 3rd+ child); benefit = avgDaily × days; optional paternity (policy-driven) days × avgDaily; notes ESIC bears it if gross ≤ ₹21,000 (employer cash cost may be nil). _Persist: none._ _Class: Indicative._

- **People ROI (roi)** — people-cost-to-revenue ratio: fully-loaded = sum of gross + employer PF (12% of min(gross,15k)) + employer ESI (3.25% if ≤21k) + monthly gratuity accrual ((15/26)×50%-basic ÷12); ratio = loaded ÷ monthly revenue (input); cost/head, revenue/head, band (Lean ≤25% / Healthy ≤40% / Elevated ≤60% / High risk). _Persist: KV — `payroll-monthly-revenue`._ _Class: KV._

- **Take-Home Breakup (takehome)** — CTC → in-hand decomposition: carves employer PF (12% of min(basic,15k)) + gratuity (4.81% of basic) out of CTC to get gross; defaults CTC = gross×12×1.12; employee PF (12% of min(basic,15k)), PT ₹200, TDS = annual slab tax (new/old via `computeSlabTax`, std ded ₹75k/₹50k, rebate ≤7L/≤5L, +4% cess) ÷ 12 → net in-hand monthly + take-home % of CTC. _Persist: none (inputs transient)._ _Class: Indicative._

- **Attrition Cost (attrition-cost)** — replacement-cost model per exit: annual CTC = gross×12×1.12; recruiting = CTC × recruitPct; ramp loss = gross × rampMonths × rampLossPct; vacancy loss = gross × backfillDays/30; onboarding = 0.5× gross; total + % of CTC + org projection (1-in-5 exits). Assumptions (recruitPct/rampMonths/rampLossPct/backfillDays) are KV. _Persist: KV — `payroll-attrition-assumptions` (selected employee local)._ _Class: KV._

- **Incentive Engine (incentive)** — variable-pay/commission: per-employee target & actual revenue; raw commission = actual × ratePct; payout = min(raw, monthlyGross × capPct) (capped flag); attainment %, effective payout rate; accrues into next run. _Persist: KV — `payroll-incentive-plan` + `payroll-incentive-achievement`._ _Class: KV._

- **Superannuation (superann)** — approved SAF projection: basic+DA = 50% gross; annual contribution = basicDA×12×rate (≤15%); taxable perquisite = max(0, contribution − ₹1.5L exempt); flags >₹7.5L combined PF+NPS+SAF cap u/s 17(2); corpus = future value of annuity over N years at assumed return; est. monthly pension = corpus×6%÷12. _Persist: none (inputs transient)._ _Class: Indicative._

- **Group Insurance (gpa)** — GMC/GTL/GPA sizing & premium: GMC SI selectable (3–10L); GTL & GPA SI = annualCTC × multiple; indicative rates per ₹1L (GMC ₹4,500, GTL ₹120, GPA ₹80); total premium + 18% GST; optional employee-share % of GMC deducted via payroll; employer cost; per-head monthly deduction. _Persist: none (inputs transient)._ _Class: Indicative._

- **PF / ESI Challan (pf-challan)** — consolidated EPFO + ESIC challan for active employees: A/C 1 = EE EPF + ER EPF diff (12% less EPS), A/C 10 = EPS (8.33%, ≤₹1,250), A/C 21 = EDLI 0.50%, A/C 2 = admin 0.50% (min ₹500); ESIC = EE 0.75% + ER 3.25% on gross ≤₹21k; combined remittance + due date (15th of next month). _Persist: none (derived)._ _Class: Indicative._

- **Payroll Register (register)** — one-page month MIS: per active employee gross, EPF (EE 12% of min(gross,15k)), ESI (EE 0.75% if ≤21k), configured TDS, total deductions, net; grand-total footer; exports CSV. _Persist: none (derived from master)._ _Class: Indicative._

- **Penalty Predictor (penalty)** — late-deposit cost estimator: PF = 7Q interest 12% p.a. simple + 14B damages by delay band (5/10/15/25% p.a.); ESI = 12% p.a.; TDS = 1.5% per month (or part) u/s 201(1A) via ceil(days/30); effective cost % of challan. _Persist: none (inputs transient)._ _Class: Indicative._

- **LWP Impact (lwp)** — loss-of-pay modeller for one employee: per-day = gross ÷ calendar days in current month; LOP = perDay × clamped LWP days; prorated gross; recomputes EPF (12% of min(prorated,15k)) and ESI (0.75% if ≤21k) on prorated wage; TDS shown unchanged; full-vs-after net comparison before locking the run. _Persist: none (inputs transient)._ _Class: Indicative._

---

### Audit notes

- **Backend-real (4):** Employees, Payroll runs (run/disburse), EWA, plus Variance (reads live `store.transactions`). Add-Employee writes to backend.
- **KV-synced records (11):** ESOP, Attendance, Reimbursements, Contractor Payouts, Appraisal hikes, Planned Hires (headcount), Leave balances, Salary Advances, IT declarations (portal), People-ROI revenue, Attrition assumptions, Incentive plan/achievement — all via `useFeatureState` → `store.featureData` → localStorage + debounced backend push + cross-device sync.
- **Preview / not-wired (1–2):** EWA payout carries a `PreviewBadge` (capability `ewaPayout`); Payslip Portal links are illustrative tokens and channels open compose windows only (no backend send).
- **Everything else is Indicative** — pure client-side statutory/HR math derived from the employee master and transient form inputs; outputs are CSV/PDF/clipboard exports, not posted to the ledger. PF wage ceiling ₹15,000, ESI eligibility ₹21,000 (EE 0.75% / ER 3.25%), gratuity 15/26 with ₹20L cap, bonus 8.33–20% on ₹7,000 calc ceiling, EPS 8.33% capped ₹1,250, EDLI/admin 0.50%, standard deduction ₹75k (new)/₹50k (old), 87A rebate ≤7L (new)/≤5L (old) are applied consistently. Several rate tables (min wages, PT slabs, salary benchmarks, insurance premiums, LWF) are hardcoded and flagged in-UI as indicative/verify-with-CA.
