# Headroom — 200 Missing Features

200 net-new tools to add to existing pages, deduped against the ~80 tools already shipped (Batches 1–20).
Each line: **Tool** — *primary stakeholder* — competitor gap closed / stakeholder pain removed.
Stakeholders: **O**=owner, **F**=in-house finance, **CA**=accountant, **S**=sales, **Ops**=operations.

---

## GST & e-invoicing → `gst` (13)
1. **GSTR-3B Auto-Prep** — F — auto-builds 3B from sales/purchase ledgers + ITC; ClearTax/Zoho do this, we only have GSTR-1.
2. **GSTR-2B vs Books ITC Reconciliation Engine** — CA — line-level match w/ "claim now / defer / chase vendor" verdict; beats Tally's manual 2A match.
3. **GST Liability Forecaster** — F — projects next month's net cash GST outgo from pipeline; nobody surfaces this.
4. **Place-of-Supply Determiner** — F — inter/intra-state + CGST/SGST/IGST split for tricky cases (SEZ, bill-to/ship-to).
5. **Multi-GSTIN Consolidator** — O — single dashboard across state registrations; Zoho charges per org.
6. **GST Rate-Change Impact Simulator** — O — re-prices catalogue when a slab changes; pain at every Council meeting.
7. **Blocked Credit (Sec 17(5)) Checker** — CA — flags ineligible ITC (motor, food, CSR) before filing.
8. **ITC Reversal (Rule 42/43) Calculator** — CA — proportionate reversal for exempt/personal supplies.
9. **Vendor GST Compliance Score** — Ops — ranks suppliers by filing regularity to protect your ITC.
10. **DRC-03 Voluntary Payment Helper** — CA — computes interest/penalty and drafts the challan.
11. **GST on Advances Tracker** — F — tracks tax paid on advances and adjustment on invoicing.
12. **Export/SEZ Zero-Rated Invoice Kit** — F — with/without-payment-of-tax + FIRC linkage; Refrens lacks this.
13. **GST Health Score & Filing Streak** — O — single 0–100 compliance score with nudges.

## Direct Tax & TDS → `tax` (12)
14. **TDS Return (24Q/26Q) Generator** — CA — quarterly e-TDS FVU file + challan mapping; ClearTax-grade.
15. **Form 26AS / AIS Reconciliation** — CA — match TDS credits vs books, flag mismatches before ITR.
16. **TDS Rate & Section Finder (194Q/206C/194C/J/I)** — F — picks section + rate + threshold per payment type.
17. **Lower-Deduction Certificate (197) Tracker** — F — applies vendor 197 certs to auto-reduce TDS.
18. **Depreciation Schedule (IT Act + Companies Act)** — CA — block-of-assets WDV vs SLM, dual books.
19. **Loss Set-off & Carry-Forward Planner** — CA — 8-year c/f, intra/inter-head set-off rules.
20. **ITR Pre-Fill Pack** — CA — assembles ITR-3/4/5/6 line items from the P&L + BS.
21. **Form 15CA/15CB Helper** — CA — foreign-remittance TDS workflow; big pain for importers.
22. **Section 80 Deduction Maximiser (entity)** — O — 80G/80JJAA/35AD planner beyond personal 80C.
23. **Equalisation Levy / TDS-194O Tracker** — F — for digital/marketplace sellers.
24. **Advance Tax vs TDS Cash-Flow Calendar** — F — net tax outgo by due date overlaid on runway.
25. **Tax Notice / Demand (143(1)) Responder** — CA — drafts rectification & response, tracks deadlines.

## Payroll & HR → `payroll` (13)
26. **CTC Structuring Optimizer** — F — splits CTC for max take-home (HRA/LTA/NPS/flexi) per regime.
27. **Attendance & Leave Register** — Ops — LOP, comp-off, leave-encashment feed into payroll.
28. **Gratuity Provision Calculator** — F — 15/26 formula + actuarial liability accrual.
29. **Reimbursement & Expense Claims** — Ops — employee claims w/ approval + payroll merge.
30. **TDS-on-Salary Projection (per employee)** — F — annualised 192 with declarations, monthly deduction.
31. **Bonus Act Eligibility & Accrual** — F — 8.33–20% within wage ceiling, statutory bonus register.
32. **Contractor / Gig Payout Register** — Ops — 194C/194J TDS, separate from salary; gig-economy gap.
33. **Salary Benchmark by Role/City** — O — pay-band guidance vs market; Keka-style.
34. **Appraisal & Increment Cycle Planner** — O — budget-bounded hike modelling across team.
35. **Payroll Journal / GL Posting** — CA — auto JV (salary, PF, ESI, TDS payable) into books.
36. **Headcount Cost Forecast** — F — fully-loaded cost projection incl. planned hires.
37. **Statutory Bonus & Leave-Encashment Liability** — F — balance-sheet provisions.
38. **Employee Self-Service Payslip Portal link** — Ops — WhatsApp/email payslip + IT-declaration capture.

## Invoices & Billing → `invoices` (11)
39. **Quotation / Estimate Builder** — S — quote → convert to invoice; Refrens/Vyapar core feature we lack.
40. **Proforma Invoice Generator** — S — advance-payment proforma w/ conversion.
41. **Recurring / Subscription Billing** — F — auto-generate periodic invoices; Zoho Subscriptions gap.
42. **Payment Links (UPI/card) on Invoice** — S — embed pay-now link, mark-paid on settlement; RazorpayX gap.
43. **Credit Note & Debit Note Manager** — F — returns/adjustments linked to original invoice + GST.
44. **Customer Credit Limit & Hold** — S — block new orders past limit/overdue; Tally feature.
45. **Multi-Currency Export Invoicing** — F — FX rate capture + INR realisation tracking.
46. **Invoice Approval Workflow** — F — maker-checker before send for high-value invoices.
47. **Branded Invoice Template Studio** — O — logo/colour/terms themes; Vyapar selling point.
48. **Delivery Challan → Invoice** — Ops — challan for goods movement, convert on billing.
49. **Late-Fee / Interest Auto-Apply** — F — overdue interest per agreed terms on re-invoicing.

## Collections → `collections` (5)
50. **Dunning Sequence Automation** — F — staged reminder ladder (D+1/7/15/30) across WhatsApp/email/SMS.
51. **DSO Trend & Aging Analytics** — F — days-sales-outstanding over time + worst payers.
52. **Promise-to-Pay Tracker** — S — log customer commitments, auto-follow-up on breach.
53. **Collection Agent Assignment & Targets** — S — route overdue accounts to reps with goals.
54. **Settlement / Write-off Workflow** — F — discount-to-settle approval + bad-debt posting.

## Receivables → `receivables` (5)
55. **Customer Risk Scoring** — F — pay-behaviour + exposure score per customer.
56. **Receivables Factoring/Discounting Estimator** — O — what you'd net selling invoices; KredX gap.
57. **Cash Application / Auto-Match Receipts** — F — match bank credits to open invoices.
58. **Concentration Risk Alert** — O — flags when >X% of AR is one customer.
59. **AR Confirmation / Balance Statement Mailer** — CA — audit-time balance confirmations.

## Vendors → `vendors` (5)
60. **Purchase Order Manager** — Ops — raise PO, track against GRN/invoice; Tally/Zoho gap.
61. **3-Way Match (PO–GRN–Invoice)** — F — auto-flag price/qty variances before payment.
62. **Vendor TDS Ledger** — CA — per-vendor TDS deducted/deposited, 26Q feed.
63. **Vendor Onboarding & KYC Vault** — Ops — PAN/GSTIN/MSME/bank verification + doc store.
64. **Early-Payment Discount Optimizer** — F — 2/10-net-30 vs cost-of-capital decision.

## Suppliers → `suppliers` (4)
65. **Supplier Scorecard (quality/OTIF/price)** — Ops — rate & rank suppliers on delivery KPIs.
66. **Reorder Point & Lead-Time Tracker** — Ops — auto-suggest reorders from consumption.
67. **Rate Contract / Price List Manager** — Ops — negotiated rates with expiry alerts.
68. **MSME / Udyam Verification Batch** — Ops — bulk-check supplier MSME status for 43B(h).

## Operations → `operations` (7)
69. **Inventory / Stock Ledger** — Ops — item-wise in/out, valuation (FIFO/WA); Vyapar core.
70. **Batch / Expiry / Serial Tracking** — Ops — for pharma/FMCG; Tally feature.
71. **Job-Work (Sec 143) Tracker** — Ops — goods sent for processing, ITC-04 support.
72. **Production / BOM Costing** — Ops — bill-of-materials → finished-goods cost.
73. **Warehouse / Multi-Location Stock** — Ops — stock by location + transfers.
74. **Barcode/QR Stock Take** — Ops — physical count reconciliation.
75. **Delivery Route & Dispatch Planner** — Ops — sequence dispatches, link to e-way bills.

## Forecast → `forecast` (5)
76. **13-Week Rolling Cash Forecast** — F — weekly inflow/outflow standard for lenders.
77. **Receivables-Driven Inflow Projection** — F — forecast collections from invoice due-dates × pay-probability.
78. **Seasonality Detector** — O — auto-detect seasonal patterns from history.
79. **Scenario-Linked Forecast (best/base/worst)** — O — three-line cash projection.
80. **Cash Buffer / Minimum-Balance Alert** — F — projects breach of safety threshold.

## Working Capital → `working-capital` (5)
81. **Cash Conversion Cycle Dashboard** — F — DIO+DSO−DPO trend with peer benchmark.
82. **Inventory Days Optimizer** — Ops — release-cash-by-cutting-stock simulator.
83. **Payables-Stretch vs Discount Trade-off** — F — optimal DPO without souring vendors.
84. **Overdraft / CC Utilisation Tracker** — F — limit usage, drawing-power vs stock+debtors.
85. **Working-Capital Gap & Funding Need** — O — quantifies the gap to pitch to lenders.

## Debt → `debt` (4)
86. **Loan Amortisation & Prepayment Simulator** — F — EMI schedule + part-prepay savings.
87. **DSCR / Interest-Coverage Tracker** — F — covenant monitoring lenders demand.
88. **Debt Consolidation / Refinance Comparator** — O — compare offers by effective cost.
89. **Moratorium & Restructuring Modeller** — F — re-cast schedule under restructuring.

## Scenarios → `scenarios` (4)
90. **Price-Change Profit Simulator** — O — margin/volume impact of a price move.
91. **Headcount/Hiring Scenario** — O — runway impact of hiring plans (beyond existing hire tab).
92. **Funding-Round Dilution Scenario** — O — pre/post-money + ESOP impact across rounds.
93. **Break-even & Margin-of-Safety** — O — units/revenue to break even by product line.

## Spend → `spend` (5)
94. **Spend Categorisation & Top-Vendors** — F — where money goes, vendor concentration.
95. **Corporate Card / Petty-Cash Manager** — Ops — card spend reconciliation + limits.
96. **Subscription / SaaS Spend Tracker** — O — recurring software spend + renewal alerts.
97. **Budget vs Actual by Cost Center** — F — overspend alerts per department.
98. **Duplicate / Anomaly Payment Detector** — CA — flags double-pays & outliers.

## Credit → `credit` (6)
99. **AA-Data Underwriting Pull** — O — Account Aggregator bank-data → credit profile; the moat.
100. **Business Loan Eligibility Matcher** — O — match profile to lender products + odds.
101. **Credit Score (commercial) Tracker** — O — CIBIL/CRIF business score over time.
102. **Invoice-Discounting Marketplace Connector** — F — list invoices for financing bids.
103. **Loan Application Document Pack** — F — auto-assemble lender doc checklist.
104. **Repayment Capacity / FOIR Calculator** — F — obligations-to-income lenders use.

## Capital → `capital` (4)
105. **Runway-Extension Planner** — O — cut/raise levers to hit target runway.
106. **SAFE / Convertible Note Modeller** — O — cap, discount, conversion math.
107. **Grant / Subsidy Finder (MSME schemes)** — O — central/state scheme eligibility.
108. **Use-of-Funds Tracker** — F — committed vs deployed vs remaining capital.

## Valuation → `valuation` (4)
109. **Comparable-Company Multiples** — O — revenue/EBITDA multiples by sector.
110. **Berkus / Scorecard (pre-revenue)** — O — early-stage valuation methods.
111. **Sensitivity / Tornado on DCF** — O — which assumptions move valuation most.
112. **409A-style FMV for ESOP** — O — defensible per-share value for option grants.

## Investor → `investor` (4)
113. **Investor Update Auto-Composer** — O — MRR/burn/runway → monthly email draft.
114. **Data Room Builder** — O — organised due-diligence document set + access log.
115. **KPI / Metric Tearsheet** — O — one-pager of headline metrics for investors.
116. **Cap-Table Waterfall (exit)** — O — payout by share class at exit values.

## Lenders → `lenders` (3)
117. **Lender Covenant Dashboard** — F — all covenants + breach risk in one view.
118. **Borrowing-Base Certificate Generator** — F — eligible AR/stock for the drawing line.
119. **Lender Reporting Pack (MIS)** — F — recurring MIS lenders demand, auto-built.

## Term Sheet → `termsheet` (3)
120. **Term-Sheet Comparator** — O — compare offers on valuation/liquidation/control.
121. **Liquidation-Preference Modeller** — O — 1x/2x participating vs non-participating payouts.
122. **ESOP-Pool Top-up Impact** — O — dilution from expanding the pool pre-round.

## Compliance → `compliance` (11)
123. **ROC Filing Auto-Prep (AOC-4 / MGT-7)** — CA — assembles annual filing data + due dates.
124. **DIR-3 KYC & DPT-3 Tracker** — CA — director KYC + deposit return deadlines.
125. **Board / AGM Meeting Manager** — O — agenda, minutes, resolutions, statutory timelines.
126. **Statutory Register Maintainer** — CA — members/charges/directors registers.
127. **Shop & Establishment / Trade License Renewals** — O — license expiry calendar.
128. **FSSAI / Industry-License Tracker** — O — sector licenses w/ renewal alerts.
129. **Labour-Law Compliance Calendar** — Ops — PF/ESI/PT/LWF/returns consolidated.
130. **Contract / Agreement Template Library** — O — NDA/MSA/employment templates + e-sign.
131. **POSH / Statutory Policy Tracker** — O — mandatory policies & committee compliance.
132. **Penalty / Late-Fee Estimator (multi-act)** — CA — quantify exposure of missed filings.
133. **Compliance Health Score & Risk Heatmap** — O — single risk view across all obligations.

## Analytics → `analytics` (9)
134. **Product / SKU Profitability** — O — margin by item, winners vs losers.
135. **Customer Profitability & Cohorts** — O — LTV, retention cohorts, churn.
136. **Region / Branch P&L** — O — geography-wise performance.
137. **Unit Economics (CAC/LTV/payback)** — O — startup-grade unit metrics.
138. **Sales Funnel & Conversion** — S — pipeline stages → win-rate.
139. **Expense Trend & Variance Analysis** — F — MoM/YoY cost drivers.
140. **Revenue Concentration & Pareto** — O — 80/20 customers/products.
141. **What-If Margin Bridge** — F — price/volume/cost/mix waterfall on profit.
142. **Predictive Churn / Late-Payment Flags** — S — accounts likely to churn or delay.

## Benchmarks → `benchmarks` (4)
143. **Industry Ratio Benchmarking** — O — your ratios vs sector medians.
144. **Peer Salary/Cost Benchmark** — O — opex structure vs comparable firms.
145. **Growth-Rate Percentile** — O — where you rank on growth in your segment.
146. **Working-Capital Benchmark** — F — CCC vs industry norms.

## Dashboard → `dashboard` (4)
147. **Custom KPI Widget Builder** — O — drag-pick metrics onto home.
148. **Daily Cash Position Snapshot** — F — all-banks balance + today's movements.
149. **Goal / Target Tracker** — O — revenue/profit goals with progress.
150. **Morning Brief Card** — O — overnight changes, due-today, alerts digest.

## CFO Brief → `cfo-brief` (3)
151. **Auto Variance Commentary** — F — plain-English "why" behind the numbers.
152. **Board-Deck Generator** — O — export financial slides for board meetings.
153. **Risk & Watchlist Brief** — O — top financial risks this period.

## Health → `health` (3)
154. **Altman Z-Score / Distress Indicator** — O — bankruptcy-risk score.
155. **Liquidity Stress Test** — F — survive-a-shock simulation (revenue drop X%).
156. **Financial Fitness Trend** — O — health score over time + drivers.

## Documents → `documents` (5)
157. **Receipt / Bill OCR Capture** — Ops — snap a bill → auto-create expense; Khatabook-grade.
158. **e-Sign / Aadhaar-eSign Workflow** — O — sign & track agreements.
159. **Document Expiry / Renewal Vault** — O — licenses/contracts/insurance with alerts.
160. **Bank Statement Parser (PDF→txns)** — F — import & categorise from any bank PDF.
161. **Audit-Trail / Document Versioning** — CA — who-changed-what log for auditors.

## Data → `data` (4)
162. **Tally Import/Export Bridge** — CA — XML in/out; the 6M-user Tally migration path.
163. **Excel / CSV Mapping Importer** — F — column-map any sheet into the right ledger.
164. **Multi-Entity Consolidation** — CA — group-level consolidated financials.
165. **Scheduled Backup & Export** — O — periodic full-data export for safety.

## Connectors → `connectors` (4)
166. **Bank / UPI Feed Connector** — F — auto-pull transactions (AA-based).
167. **Payment-Gateway Reconciliation** — F — Razorpay/PayU settlement vs orders.
168. **E-commerce (Amazon/Flipkart) Sync** — S — marketplace orders/settlements import.
169. **Connector Health & Sync Monitor** — Ops — last-sync, failures, retry.

## Settings → `settings` (4)
170. **Role & Permission Matrix (team)** — O — granular access for finance/CA/sales/ops.
171. **Approval-Policy Builder** — F — value-based maker-checker rules.
172. **Financial-Year & Books-Lock** — CA — lock periods after filing.
173. **Audit Log / Login History** — O — security & access review.

## Admin → `admin` (3)
174. **CA / Advisor Invite & Workspace** — CA — multi-client accountant collaboration; distribution moat.
175. **Usage & Activity Analytics** — O — who's using what across the team.
176. **Data-Retention & Compliance Settings** — O — DPDP-aligned retention controls.

## WhatsApp → `whatsapp` (5)
177. **WhatsApp Invoice Send & Pay** — S — send invoice + pay-link, capture status; 80%-of-market moat.
178. **WhatsApp Payment Reminder Bot** — F — automated overdue nudges via WA.
179. **WhatsApp Daily-Sales Capture** — O — owner texts sales → booked automatically.
180. **WhatsApp Statement-on-Demand** — S — customer requests ledger via WA.
181. **WhatsApp Approval Actions** — F — approve invoices/payments from chat.

## Alerts → `alerts` (4)
182. **Smart Threshold Alert Builder** — O — "alert me when X crosses Y".
183. **Compliance Due-Date Alerts** — CA — escalating reminders before every deadline.
184. **Cash-Low / Overdraft Alert** — F — proactive liquidity warnings.
185. **Fraud / Anomaly Alerts** — CA — unusual payments, new payees, round-trips.

## Transactions → `transactions` (7)
186. **Auto-Categorisation Rules Engine** — F — rules to classify txns by payee/amount.
187. **Bank Reconciliation Workbench** — CA — match book vs bank, clear unmatched.
188. **Split-Transaction Tool** — F — one payment across multiple heads/projects.
189. **Bulk Edit / Tagging** — F — categorise hundreds of txns at once.
190. **Inter-Account Transfer Detection** — F — auto-net self-transfers, no double count.
191. **Project / Cost-Center Tagging** — O — P&L by project/job.
192. **Cash vs Accrual Toggle** — CA — view books on either basis.

## Statements → `statements` (5)
193. **Cash Flow Statement (AS-3 / Ind AS 7)** — CA — direct & indirect method auto-build.
194. **Schedule III Balance Sheet Formatter** — CA — statutory-format financials for filing.
195. **Notes to Accounts Builder** — CA — auto-draft disclosures.
196. **Comparative / Common-Size Statements** — O — YoY and percentage-of-revenue views.
197. **Segment Reporting** — O — business-segment financials.

## Budgets → `budgets` (3)
198. **Rolling / Zero-Based Budget Builder** — F — build budgets from scratch each period.
199. **Department Budget Allocation & Approval** — O — top-down allocation w/ sign-off.
200. **Capex Budget & Approval Tracker** — F — capital-spend plan vs actual.
