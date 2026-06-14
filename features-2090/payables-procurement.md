# Accounts Payable & Procurement (140 features)
> Headroom turns India's chaotic, paper-driven vendor spend into an autonomous, compliance-clean, cash-optimized procurement nervous system that pays the right vendor, at the right time, for the right reason.

1. **Vendor master with GSTIN validation** — Auto-pull legal name, address, filing status from GSTN on GSTIN entry; flag inactive/cancelled. · _finance_ · SMB pain: paying suspended vendors loses ITC
2. **Bulk vendor import from Tally** — One-click migrate vendor ledgers, opening balances, and bank details from Tally/Busy XML. · _CA_ · competitor gap: Tally lock-in
3. **Vendor bank account penny-drop verification** — Validate beneficiary name against bank records before first payment to stop misdirected funds. · _finance_ · SMB pain: wrong-account payouts
4. **Duplicate vendor detection** — Fuzzy-match PAN, GSTIN, bank, and name to merge duplicate vendor records automatically. · _finance_ · SMB pain: fragmented vendor data
5. **Vendor KYC document vault** — Collect PAN, GST cert, MSME Udyam, cancelled cheque via a secure self-serve link. · _ops_ · SMB pain: missing vendor docs at audit
6. **Udyam/MSME classification capture** — Record vendor's Micro/Small/Medium status and Udyam number for 43B(h) tracking. · _finance_ · India: MSME 43B(h) compliance
7. **MSME 43B(h) 45-day clock** — Per-invoice countdown to the 15/45-day statutory MSME payment deadline with breach alerts. · _finance_ · India: 43B(h) disallowance risk
8. **43B(h) disallowance pre-empt report** — Estimate income added back for MSME dues unpaid by year-end and the tax cost. · _CA_ · India: avoid Section 43B(h) tax hit
9. **Auto-prioritize MSME vendors in pay run** — Pay-run scheduler surfaces MSME-flagged invoices first to beat the 45-day limit. · _finance_ · India: 43B(h) penalty avoidance
10. **Purchase order creation** — Raise multi-line POs with HSN, quantity, rate, GST, and delivery terms from a template. · _ops_ · SMB pain: informal purchasing
11. **PO approval workflow** — Route POs above thresholds to approvers by amount, category, or cost center. · _owner_ · SMB pain: no spend control
12. **Mobile PO approval** — Approve or reject POs from WhatsApp or phone with one tap, with full context attached. · _owner_ · competitor gap: desk-bound approvals
13. **Goods Receipt Note (GRN) capture** — Record received quantities against a PO, including partial and over-receipts. · _ops_ · SMB pain: no receiving discipline
14. **Three-way match engine** — Auto-match PO, GRN, and invoice on qty, rate, and tax; release only clean matches. · _finance_ · competitor gap: manual matching
15. **Tolerance-based auto-approval** — Auto-pass invoices within configurable price/qty tolerance to cut manual review. · _finance_ · SMB pain: AP bottleneck
16. **Invoice OCR ingestion** — Extract vendor, GSTIN, line items, and tax from PDF/photo invoices into AP automatically. · _finance_ · SMB pain: manual data entry
17. **WhatsApp invoice intake** — Vendors send invoices to a WhatsApp number; bot parses and files them into AP. · _finance_ · competitor gap: India WhatsApp-native
18. **Email inbox auto-capture** — A dedicated AP inbox auto-imports and codes invoices arriving by email. · _finance_ · SMB pain: invoices lost in email
19. **GSTR-2B reconciliation for purchases** — Match purchase invoices to GSTR-2B to confirm eligible ITC before payment. · _CA_ · India: ITC mismatch losses
20. **Withhold payment on missing 2B** — Flag invoices where the vendor hasn't uploaded GSTR-1, blocking ITC. · _finance_ · India: vendor non-upload ITC risk
21. **TDS auto-computation on bills** — Apply correct section (194C/194J/194Q etc.), rate, and threshold per vendor automatically. · _CA_ · India: TDS error penalties
22. **194Q vs 206C(1H) decision helper** — Determine whether buyer TDS or seller TCS applies on a purchase and act. · _CA_ · India: 194Q confusion
23. **Lower/nil TDS certificate handling** — Apply vendor's 197 certificate rate within validity and amount cap automatically. · _CA_ · India: excess TDS deduction
24. **TDS challan and return prep** — Aggregate deductions into 26Q/27Q-ready data with payment deadlines. · _CA_ · India: TDS filing burden
25. **Approval matrix by category** — Different approvers and limits for capex, opex, IT, travel, and services. · _owner_ · SMB pain: one-size approvals
26. **Delegation of authority** — Temporary approver delegation during leave with audit trail and expiry. · _owner_ · SMB pain: approvals stall on absence
27. **Segregation-of-duties enforcement** — Block the same user from creating a vendor, raising a bill, and paying it. · _finance_ · competitor gap: weak SMB controls
28. **Pay run scheduling** — Build batched pay runs by due date, optimizing for discounts and cash position. · _finance_ · SMB pain: ad-hoc payments
29. **Maker-checker payment release** — Two-step authorization before any bank file or payout executes. · _finance_ · SMB pain: fraud exposure
30. **Multi-rail payout** — Pay via UPI, IMPS, NEFT, RTGS, or virtual account chosen by amount and speed. · _finance_ · competitor gap: rail flexibility
31. **UPI-to-vendor with PO reference** — Push UPI payments carrying invoice/PO IDs so vendors auto-reconcile. · _finance_ · India: UPI-native B2B
32. **Vendor payment status portal** — Vendors self-check payment status, UTR, and TDS deducted without calling. · _customer_ · SMB pain: vendor payment chasing
33. **Expense claim submission** — Employees submit expenses with receipt photos, GST capture, and policy hints. · _ops_ · SMB pain: spreadsheet expenses
34. **Corporate card spend feed** — Live card transactions auto-matched to receipts and coded to ledgers. · _finance_ · competitor gap: Ramp/Brex parity
35. **Policy-aware expense checks** — Flag out-of-policy claims (limits, alcohol, weekend) at submission, not after. · _finance_ · SMB pain: leaky expense policy
36. **Petty cash register** — Track physical cash floats, top-ups, and spends per location with reconciliation. · _ops_ · SMB pain: untracked petty cash
37. **Petty cash photo logging** — Snap a bill, enter amount, auto-deduct from the float balance instantly. · _ops_ · SMB pain: cash leakage
38. **Mileage and per-diem auto-calc** — Compute travel reimbursements from GPS distance and per-diem rules. · _ops_ · SMB pain: manual travel claims
39. **Early-payment discount capture** — Detect 2/10-net-30-style terms and recommend paying early when cash allows. · _finance_ · competitor gap: Cashflo dynamic discounting
40. **Dynamic discounting marketplace** — Vendors offer sliding discounts for earlier payment; system picks best yield. · _finance_ · India: beat Cashflo
41. **Discount-vs-cost-of-capital optimizer** — Compare early-pay discount yield against your borrowing rate before deciding. · _finance_ · SMB pain: cash vs discount tradeoff
42. **Spend-under-management dashboard** — Show total addressable spend, what's on contract, and maverick spend share. · _owner_ · competitor gap: procurement analytics
43. **Maverick spend detection** — Flag purchases made outside approved vendors or contracts for review. · _finance_ · SMB pain: off-contract leakage
44. **Vendor spend concentration alert** — Warn when one vendor exceeds a risky share of category or total spend. · _owner_ · SMB pain: supplier dependency
45. **Contract repository** — Store vendor contracts with rate cards, validity, renewal, and penalty clauses. · _ops_ · SMB pain: lost contracts
46. **Contract price compliance** — Auto-check invoice rates against the active contract rate card. · _finance_ · SMB pain: invoice overcharging
47. **Contract renewal reminders** — Alert owners before auto-renewal or expiry to renegotiate or exit. · _owner_ · SMB pain: silent auto-renewals
48. **Purchase requisition workflow** — Internal requesters raise needs that convert to RFQs or POs on approval. · _ops_ · SMB pain: informal requests
49. **RFQ to multiple vendors** — Send the same request to vendors and compare quotes side by side. · _ops_ · competitor gap: sourcing tools
50. **Quote comparison scorecard** — Rank quotes on price, lead time, terms, and vendor reliability score. · _ops_ · SMB pain: opaque vendor selection
51. **Vendor reliability score** — Rate vendors on on-time delivery, quality rejects, and dispute history. · _ops_ · SMB pain: no vendor track record
52. **Blanket PO with releases** — Set an umbrella PO and draw down releases against agreed annual volume. · _ops_ · SMB pain: repeat purchasing overhead
53. **Recurring bill automation** — Auto-create and schedule rent, utility, and SaaS bills on a calendar. · _finance_ · SMB pain: missed recurring dues
54. **Subscription/SaaS spend tracker** — Detect recurring software charges and flag unused or duplicate tools. · _finance_ · trend: SaaS sprawl
55. **GST ITC eligibility classifier** — Tag each purchase as eligible, blocked (Sec 17(5)), or proportionate. · _CA_ · India: blocked-credit errors
56. **Reverse charge (RCM) detection** — Identify RCM-liable purchases (unregistered, specified services) and self-invoice. · _CA_ · India: RCM compliance
57. **Import purchase + BoE matching** — Match import invoices to Bill of Entry for IGST credit on imports. · _CA_ · India: import ITC
58. **Vendor aging and payables report** — Bucket outstanding payables by age with MSME and overdue highlights. · _finance_ · SMB pain: payables visibility
59. **Cash-aware payment planner** — Schedule pay runs against forecast bank balance to avoid overdrafts. · _finance_ · SMB pain: payment overdraws
60. **Payment hold and dispute workflow** — Place an invoice on hold with a reason and route to dispute resolution. · _finance_ · SMB pain: paying disputed bills
61. **Credit/debit note matching** — Auto-net vendor credit notes against open bills before payment. · _finance_ · SMB pain: unapplied credits
62. **Advance and prepayment tracking** — Track advances paid to vendors and auto-adjust against future invoices. · _finance_ · SMB pain: lost advances
63. **Vendor statement reconciliation** — Match a vendor's statement against your ledger to surface gaps fast. · _finance_ · SMB pain: month-end reconciliation
64. **GRN-to-invoice gap report** — Show goods received but not yet invoiced (and vice versa) for accruals. · _finance_ · SMB pain: missing accruals
65. **Landed cost allocation** — Spread freight, duty, and insurance across received items for true cost. · _finance_ · SMB pain: hidden landed costs
66. **Multi-location procurement** — Branch-level POs and budgets rolling into a consolidated company view. · _owner_ · SMB pain: multi-branch chaos
67. **Budget-vs-actual at PO time** — Block or warn on POs that breach the department's remaining budget. · _finance_ · SMB pain: budget overruns
68. **Cost center and project tagging** — Tag every bill and PO to a cost center or project for true P&L. · _finance_ · SMB pain: no cost attribution
69. **Vendor onboarding self-service** — Vendors complete profile, KYC, and bank details via a guided link. · _ops_ · SMB pain: onboarding friction
70. **Vendor risk and sanction screening** — Screen vendors against blacklists, GST-cancelled lists, and adverse media. · _finance_ · trend: vendor risk management
71. **Audit trail for every AP action** — Immutable log of who created, edited, approved, and paid each item. · _CA_ · SMB pain: audit defensibility
72. **One-click audit pack export** — Bundle PO, GRN, invoice, approval, and payment proof per transaction. · _CA_ · SMB pain: audit prep time
73. **Spend categorization with AI** — Auto-classify every bill to GL and category from vendor and line text. · _finance_ · SMB pain: miscoding
74. **Approval SLA tracking** — Measure and nudge slow approvers; report approval cycle time by person. · _owner_ · SMB pain: approval delays
75. **Vendor communication hub** — Threaded messaging with vendors tied to specific POs and invoices. · _ops_ · SMB pain: scattered vendor comms
76. **Negotiation playbook prompts** — Suggest counter-offers and terms based on category benchmarks. · _ops_ · competitor gap: sourcing intelligence
77. **Price benchmark intelligence** — Compare what you pay vs anonymized peer SMB prices for the same item. · _owner_ · trend: data-network pricing
78. **Tail-spend automation** — Auto-handle low-value, high-volume purchases via pre-set vendors and limits. · _ops_ · SMB pain: tail-spend overhead
79. **Capex approval and tracking** — Multi-stage capex requests with ROI capture and asset register handoff. · _owner_ · SMB pain: capex governance
80. **Vendor performance reviews** — Periodic scorecards shared with vendors to drive service improvement. · _ops_ · trend: supplier relationship management
81. **AP exception queue** — A single triage list of mismatches, missing docs, and policy breaks. · _finance_ · SMB pain: scattered exceptions
82. **Forecast of upcoming payables** — Project the next 30/60/90 days of vendor outflows from open POs and bills. · _finance_ · SMB pain: cash surprises
83. **Working-capital impact simulator** — Model how stretching or accelerating vendor terms shifts the cash cycle. · _owner_ · SMB pain: cash cycle tuning
84. **Supply-chain finance / vendor financing** — Offer vendors early payment funded by a lender at a small fee. · _finance_ · India: OCEN-enabled vendor finance
85. **Account Aggregator vendor underwriting** — Use AA-shared vendor cash flows to extend supplier credit terms safely. · _CA_ · India: DPI 2.0 AA
86. **e-Invoice (IRN) validation on purchases** — Verify vendor invoices carry a valid IRN/QR for large vendors. · _CA_ · India: e-invoicing mandate
87. **Duplicate invoice prevention** — Block payment of the same invoice number/amount/vendor combination twice. · _finance_ · SMB pain: double payments
88. **Fraud anomaly detection** — Flag round-tripping, sudden bank-detail changes, and off-hours approvals. · _finance_ · trend: AP fraud rising
89. **Bank-detail change verification** — Require out-of-band confirmation when a vendor's bank account changes. · _finance_ · SMB pain: BEC fraud
90. **Multi-currency vendor bills** — Record FX bills with rate capture and revaluation for import vendors. · _finance_ · SMB pain: import accounting
91. **GIFT-City / cross-border payouts** — Route eligible foreign vendor payments via low-cost cross-border rails. · _finance_ · trend: cross-border SMB
92. **ESG/carbon spend tagging** — Tag procurement spend with supplier carbon factors for Scope 3 reporting. · _owner_ · trend: ESG accounting
93. **Sustainable vendor preference** — Rank vendors by verified ESG credentials in sourcing decisions. · _ops_ · trend: green procurement
94. **DPDP-compliant vendor data handling** — Consent-tracked, minimized storage of vendor PII with deletion rights. · _CA_ · India: DPDP Act
95. **Role-based AP access** — Granular permissions for view, approve, pay across team members. · _owner_ · core-user: small team roles
96. **Voice-driven bill entry** — Speak an expense in Hindi/regional language; it's parsed and logged. · _ops_ · India: vernacular voice UX
97. **WhatsApp pay-run approvals digest** — Daily summary of pending payments approvable in-thread on WhatsApp. · _owner_ · competitor gap: India messaging-first
98. **Smart payment timing engine** — Recommend the exact day to pay each bill to balance discount, MSME limit, and cash. · _finance_ · SMB pain: timing tradeoffs
99. **Vendor digital twin** — A live model of each vendor's reliability, pricing trend, and risk for decisions. · _owner_ · trend: digital twin
100. **Procurement digital twin of the business** — Simulate how demand, prices, and terms changes ripple through spend and cash. · _owner_ · 2090: predictive digital twin
101. **AP copilot for natural-language queries** — Ask "what do we owe MSME vendors this week?" and get an instant answer. · _finance_ · trend: agentic finance copilots
102. **Autonomous three-way-match agent** — An agent clears all clean matches end-to-end, escalating only true exceptions. · _finance_ · 2090: agentic AP
103. **Autonomous pay-run agent** — Agent builds, optimizes, and schedules pay runs within owner-set guardrails. · _finance_ · 2090: autonomous payments
104. **Self-onboarding vendor agent** — An agent collects, verifies, and activates new vendors without staff touch. · _ops_ · 2090: zero-touch onboarding
105. **Agent-to-agent price negotiation** — Your procurement agent negotiates rates with the vendor's sales agent autonomously. · _ops_ · 2090: agent-to-agent commerce
106. **Continuous RFQ auto-sourcing** — An agent constantly re-sources tail items to the cheapest reliable vendor. · _ops_ · 2090: autonomous sourcing
107. **Programmable conditional vendor payments** — Release funds only when smart-contract conditions (GRN, quality pass) are met. · _finance_ · 2090: programmable money
108. **Milestone escrow for projects** — Lock vendor payment in escrow, releasing per verified milestone automatically. · _finance_ · trend: smart-contract escrow
109. **CBDC programmable disbursement** — Pay vendors in e-rupee tagged so funds can only be used for permitted purposes. · _finance_ · India: CBDC programmable money
110. **Tokenized purchase-order financing** — Tokenize approved POs so vendors instantly borrow against them on-chain. · _finance_ · 2090: tokenized receivables
111. **Quality-gated auto-release** — IoT/inspection data triggers payment release the moment goods pass QC. · _ops_ · 2090: event-driven settlement
112. **Ambient receipt capture** — Spatial/AR glasses log a purchase the instant a receipt is glanced at. · _ops_ · 2090: ambient finance
113. **Predictive vendor default warning** — Forecast which vendors may fail to deliver from cash-flow and signal data. · _owner_ · 2090: predictive supply risk
114. **Demand-driven auto-replenishment** — Agent raises POs automatically when predicted stock dips below reorder point. · _ops_ · 2090: self-driving procurement
115. **Self-negotiating contract renewals** — Agent re-negotiates contract terms at renewal using market and usage data. · _owner_ · 2090: autonomous contracting
116. **Spend optimization swarm** — Multiple agents continuously find consolidation and savings across categories. · _owner_ · 2090: multi-agent optimization
117. **Real-time 43B(h) auto-payer** — Agent pays MSME vendors precisely before the statutory deadline, cash permitting. · _finance_ · India + 2090: zero-touch 43B(h)
118. **Zero-touch GST ITC reconciliation** — Agent reconciles every purchase to 2B and resolves mismatches with vendors itself. · _CA_ · 2090: zero-touch compliance
119. **Autonomous TDS lifecycle** — Agent deducts, deposits, and files TDS for vendor payments with no human step. · _CA_ · 2090: self-driving tax
120. **Neural-interface approval** — Approve high-trust payments by intent via a neural/biometric confirmation. · _owner_ · 2090: neural interfaces
121. **Self-auditing AP ledger** — Books continuously audit themselves and surface anomalies before period close. · _CA_ · 2090: self-driving books
122. **Counterparty consent-based data exchange** — DEPA-style consented sharing of verified data between buyer and vendor agents. · _CA_ · India: DEPA / agent trust
123. **Carbon-aware payment routing** — Choose payout rails and vendors that minimize the spend's carbon footprint. · _owner_ · 2090: carbon-optimized finance
124. **Quantum fraud and collusion modeling** — Quantum models detect complex vendor-employee collusion rings invisibly. · _finance_ · trend: quantum risk
125. **Spend genome / category DNA** — A learned fingerprint of normal spend that instantly flags anomalies. · _finance_ · 2090: behavioral spend modeling
126. **Just-in-time vendor credit at PO** — Embedded one-tap working capital appears exactly when a PO needs funding. · _finance_ · trend: embedded finance
127. **Dynamic vendor terms optimization** — Agent renegotiates payment terms across vendors to hit a target cash cycle. · _owner_ · 2090: autonomous working-capital
128. **Self-healing invoice mismatches** — Agent fixes OCR/coding errors and re-matches without human correction. · _finance_ · 2090: self-correcting AP
129. **Vendor reputation graph** — A cross-network trust graph of vendor reliability shared across SMBs. · _ops_ · 2090: data-network moat
130. **Predictive cash-discount auctioning** — Agent auctions your early-pay cash to vendors offering the best yield daily. · _finance_ · 2090: dynamic yield optimization
131. **Autonomous dispute resolution** — Agents on both sides settle invoice disputes via agreed evidence rules. · _ops_ · 2090: agent-to-agent dispute
132. **Spend foresight narrative** — A daily plain-language brief on where spend is drifting and why, with actions. · _owner_ · trend: AI-CFO brief
133. **Counterfactual spend simulator** — "What if we switched this vendor?" shows cash, risk, and ESG impact instantly. · _owner_ · 2090: decision simulation
134. **Regulation-tracking compliance agent** — Agent watches GST/TDS/MSME rule changes and reconfigures AP rules itself. · _CA_ · 2090: living compliance
135. **Cross-border programmable settlement** — Smart-contract FX settlement with vendors clearing instantly across borders. · _finance_ · 2090: programmable cross-border
136. **Embedded vendor insurance** — Auto-offer delivery/quality insurance on a PO, priced by vendor risk score. · _ops_ · trend: embedded insurance
137. **Holographic procurement command center** — Spatial AR cockpit showing live spend, cash, and vendor risk as a navigable map. · _owner_ · 2090: spatial interfaces
138. **Intent-to-procurement translation** — Owner states a business goal; agents derive the procurement plan and execute. · _owner_ · 2090: intent-driven autonomy
139. **Self-optimizing approval policy** — System learns which approvals are rubber-stamps and auto-clears them safely. · _finance_ · 2090: adaptive controls
140. **Fully autonomous AP close** — Agent reconciles, accrues, matches, pays, and closes payables each period untouched. · _CA_ · 2090: zero-touch month-end
