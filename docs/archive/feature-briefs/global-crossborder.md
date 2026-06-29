# Global, Cross-Border & Multi-Currency (140 features)
> Turning every Indian SMB into a borderless trader with autonomous FX, zero-touch FEMA compliance, and instant cross-border settlement rails.

1. **Multi-Currency Ledger Core** — Native books in unlimited currencies with daily revaluation and base-currency reporting per Ind-AS 21. · _finance_ · Tally lacks true multi-currency depth
2. **Live FX Rate Feed** — Pulls RBI reference, interbank, and card rates every minute into invoices and journals automatically. · _finance_ · SMBs hardcode stale rates manually
3. **Realized/Unrealized FX Gain Tracker** — Auto-posts forex gain/loss on settlement and at period-end with audit trail. · _CA_ · Manual forex P&L is error-prone
4. **Multi-Currency Invoicing** — Bill overseas clients in their currency, collect in INR, with auto-conversion notes on the PDF. · _sales_ · Vyapar is INR-only
5. **Currency Hedge Cost Calculator** — Estimates forward/option cost before quoting to protect export margins. · _finance_ · Exporters quote blind to FX risk
6. **FEMA Transaction Classifier** — Tags every cross-border flow with the correct FEMA purpose code automatically. · _CA_ · Wrong purpose codes trigger AD-bank rejections
7. **Purpose Code Library** — Searchable, plain-language RBI purpose-code directory mapped to common SMB scenarios. · _owner_ · Owners don't know which code applies
8. **FIRC Auto-Capture** — Fetches Foreign Inward Remittance Certificates from AD banks and attaches to matching invoices. · _finance_ · FIRCs get lost, blocking GST refunds
9. **e-FIRA Reconciliation** — Reconciles electronic FIRA against export invoices and flags shortfalls before realization deadlines. · _CA_ · Realization tracking is manual
10. **eBRC Generation Assistant** — Prepares and files electronic Bank Realization Certificates on DGFT for export incentive claims. · _ops_ · eBRC filing is a separate painful portal
11. **Export Realization Deadline Monitor** — Counts down the 9-month FEMA realization window per shipment and alerts before breach. · _finance_ · Late realization invites RBI penalties
12. **SWIFT Payment Tracker** — Tracks outbound/inbound SWIFT MT103 status with GPI reference end-to-end. · _finance_ · Wires vanish into a black box
13. **Multi-Rail Payout Router** — Chooses cheapest of SWIFT, local rails, wallets, or stablecoin per corridor and amount. · _finance_ · Banks overcharge on every wire
14. **Cross-Border Collection Links** — Shareable pay-pages that let foreign customers pay by card, ACH, SEPA, or UPI-global. · _sales_ · Collecting from abroad is clunky
15. **Virtual Foreign Accounts** — Issues local USD/GBP/EUR receiving accounts so clients pay domestically, funds sweep to India. · _finance_ · Wise-style accounts unavailable in SMB tools
16. **FX Markup Transparency Meter** — Shows the true spread your bank charges versus mid-market on each conversion. · _owner_ · Hidden FX markups erode profit
17. **A2 Form Auto-Filler** — Pre-populates Form A2 for outward remittances from vendor and invoice data. · _ops_ · A2 forms are repetitive paperwork
18. **TCS on Foreign Remittance Calculator** — Computes 20% LRS/TCS where applicable and reconciles with 26AS. · _CA_ · TCS rules confuse remitters
19. **15CA/15CB Workflow** — Generates Form 15CA, routes 15CB to the CA, and files with the bank for foreign payments. · _CA_ · 15CA/CB is a recurring bottleneck
20. **Withholding Tax (DTAA) Engine** — Applies treaty rates by counterparty country and produces the rate-justification memo. · _CA_ · DTAA lookups done manually
21. **Tax Residency Certificate Vault** — Stores counterparty TRCs and No-PE declarations, flagging expiry before payments. · _CA_ · Missing TRC means higher withholding
22. **Import Letter of Credit Manager** — Drafts, tracks, and amends import LCs with document checklists per UCP 600. · _finance_ · LC handling is opaque for SMBs
23. **Export LC Discrepancy Checker** — Scans presented documents against LC terms and flags discrepancies before bank presentation. · _ops_ · Discrepancies delay payment
24. **Packing Credit (PCFC) Tracker** — Monitors pre-shipment credit limits, drawdowns, and liquidation against export orders. · _finance_ · Packing-credit ops are spreadsheet-driven
25. **ECGC Cover Manager** — Buys, tracks, and files claims on Export Credit Guarantee cover for buyer default. · _finance_ · ECGC underused by small exporters
26. **Buyer Country Risk Score** — Rates importer creditworthiness and country risk before extending export terms. · _sales_ · No credit visibility on foreign buyers
27. **Shipping Bill Linker** — Connects ICEGATE shipping bills to invoices, FIRCs, and eBRCs in one trade dossier. · _ops_ · Trade docs scattered across portals
28. **Bill of Entry Reconciler** — Matches import Bill of Entry against vendor invoices and IGST paid for ITC. · _CA_ · Import ITC mismatches are common
29. **Customs Duty Estimator** — Calculates BCD, IGST, cess, and AIDC by HSN before import to plan landed cost. · _ops_ · Landed-cost surprises hurt pricing
30. **HSN/HS Code Harmonizer** — Maps Indian HSN to destination-country HS codes for accurate export documentation. · _ops_ · Code mismatches stall shipments
31. **Duty Drawback Claim Builder** — Computes and files drawback claims on exported goods automatically. · _finance_ · Drawback left unclaimed
32. **RoDTEP/RoSCTL Tracker** — Tracks remission scrips earned and their utilization or sale. · _finance_ · Scrip value forgotten
33. **Advance Authorisation Monitor** — Tracks duty-free import obligations and export fulfillment under AA scheme. · _ops_ · Export obligation defaults invite penalties
34. **EPCG Obligation Dashboard** — Monitors export-promotion capital-goods obligations and time-bound fulfillment. · _finance_ · EPCG defaults are costly
35. **SEZ/EOU Compliance Pack** — Manages SOFTEX, NFE computation, and unit-level filings for SEZ/EOU exporters. · _CA_ · SEZ paperwork is specialized
36. **SOFTEX Auto-Filer** — Generates and files SOFTEX forms for software/service exports on RBI EDPMS. · _ops_ · SOFTEX is a manual monthly grind
37. **EDPMS/IDPMS Sync** — Reconciles RBI export/import data-processing systems to clear outstanding entries. · _CA_ · EDPMS caution-listing freezes exports
38. **Caution-List Early Warning** — Predicts EDPMS caution-listing risk and prompts corrective action first. · _finance_ · Caution-listing blocks new shipments
39. **GIFT City Account Opener** — Guided IFSC banking-unit and entity setup in GIFT City with document automation. · _owner_ · GIFT City onboarding is confusing
40. **GIFT City Tax-Benefit Modeler** — Projects 100% tax-holiday and exemption savings for IFSC-routed business. · _CA_ · Benefits poorly understood by SMBs
41. **Service Export GST Refund Engine** — Files LUT and claims zero-rated GST refunds on service exports with realization proof. · _finance_ · Service exporters lose refund cycles
42. **LUT Renewal Reminder** — Auto-renews Letter of Undertaking each financial year so exports stay zero-rated. · _CA_ · Lapsed LUT triggers tax demand
43. **Merchant Trade Workflow** — Handles third-country trade flows with FEMA-compliant payment timing and documentation. · _finance_ · Merchant trade rules trip up SMBs
44. **Foreign Vendor Onboarding** — KYC, tax-form, and banking capture for overseas suppliers with sanctions screening. · _ops_ · Vendor onboarding lacks compliance checks
45. **Sanctions & PEP Screening** — Screens counterparties against OFAC, UN, EU, and RBI lists before any payment. · _finance_ · No SMB tool screens sanctions
46. **AML Cross-Border Monitor** — Flags structuring, layering, and unusual corridor patterns for FIU-IND alignment. · _CA_ · Compliance gaps risk penalties
47. **Multi-Currency Bank Reconciliation** — Auto-matches foreign-currency bank statements to ledger across rate dates. · _finance_ · Reconciling FX accounts is painful
48. **Nostro/Vostro View** — Consolidated balances across all foreign bank relationships in one currency-normalized screen. · _finance_ · Cross-bank visibility is absent
49. **FX Exposure Heatmap** — Visualizes net open position by currency and tenor across receivables and payables. · _finance_ · Exposure is invisible until it bites
50. **Natural Hedge Optimizer** — Suggests matching receivables and payables in the same currency to cut hedging cost. · _finance_ · Hedging cost overpaid
51. **Forward Contract Booking** — Books, tracks, and rolls bank forward contracts linked to underlying exposures. · _finance_ · Forwards managed off-system
52. **Hedge Effectiveness Tester** — Runs Ind-AS 109 hedge-accounting effectiveness tests and documents them. · _CA_ · Hedge accounting is complex
53. **Currency Volatility Alerts** — Notifies when a held currency moves beyond a set threshold against INR. · _owner_ · Owners miss FX swings
54. **Repatriation Planner** — Schedules profit, dividend, and royalty repatriation within FEMA limits and tax-optimally. · _finance_ · Repatriation timing left to chance
55. **ODI/FDI Filing Assistant** — Prepares Overseas Direct Investment and inbound FDI filings (Form FC-GPR, ODI). · _CA_ · ODI/FDI forms are specialist work
56. **Annual Performance Report Filer** — Compiles and files APR for overseas subsidiaries with RBI on time. · _CA_ · APR deadlines slip
57. **FLA Return Automator** — Builds the Foreign Liabilities and Assets return from the multi-entity ledger. · _CA_ · FLA return is annual scramble
58. **Global Entity Org-Chart** — Maintains a live map of subsidiaries, branches, and ownership across jurisdictions. · _owner_ · Group structure undocumented
59. **Cross-Border Intercompany Ledger** — Tracks intercompany loans, invoices, and balances with auto-elimination on consolidation. · _finance_ · Intercompany reconciliation is messy
60. **Multi-Entity Consolidation** — Consolidates global subsidiaries into one statement with FX translation and minority interest. · _CA_ · Consolidation tools too enterprise
61. **Transfer Pricing Documentation** — Generates local file, master file, and benchmarking for related-party transactions. · _CA_ · TP docs cost lakhs from consultants
62. **Arm's-Length Range Engine** — Pulls comparables and computes arm's-length pricing bands for intercompany deals. · _CA_ · No affordable TP benchmarking
63. **Transfer Pricing Adjustment Tracker** — Flags transactions outside the arm's-length range and proposes year-end true-ups. · _CA_ · TP adjustments missed until audit
64. **Country-by-Country Report Builder** — Assembles CbCR for groups crossing thresholds across all operating countries. · _CA_ · CbCR is a heavy manual lift
65. **BEPS Pillar Two Calculator** — Computes global minimum tax (15%) top-up liability for in-scope groups. · _CA_ · Pillar Two compliance new and unclear
66. **Permanent Establishment Risk Radar** — Warns when remote staff or activity could create a taxable PE abroad. · _CA_ · PE risk silently accrues
67. **Global Payroll Hub** — Runs compliant payroll across countries with local tax, social-security, and statutory filings. · _ops_ · Multi-country payroll fragmented
68. **EOR/Contractor Manager** — Onboards overseas employees via employer-of-record and pays global contractors compliantly. · _ops_ · Hiring abroad needs many vendors
69. **Cross-Border Salary FX Lock** — Lets globally-paid staff lock conversion rates so take-home is predictable. · _customer_ · FX swings hit foreign-paid employees
70. **Expat Tax Equalization** — Computes tax-equalization and split-payroll for assignees across home and host countries. · _CA_ · Expat tax is bespoke and costly
71. **Multi-Currency Expense Cards** — Issues cards that auto-convert at mid-market and post in employees' local currency. · _ops_ · Travel cards gouge on FX
72. **Per-Diem & Travel FX Manager** — Sets country per-diems, captures receipts, and reconciles foreign spend automatically. · _finance_ · Foreign-travel expense reconciliation painful
73. **Global VAT/GST Registry** — Tracks indirect-tax registrations and filing calendars across all sales jurisdictions. · _CA_ · Foreign VAT obligations overlooked
74. **Cross-Border E-Invoicing Compliance** — Adapts invoices to each country's mandatory e-invoice format (Peppol, CFDI, KSA). · _finance_ · Foreign e-invoice mandates surprise exporters
75. **Peppol Network Connector** — Sends and receives structured invoices over the Peppol network for EU/APAC buyers. · _ops_ · No Peppol access in Indian tools
76. **Multi-Currency Quote-to-Cash** — End-to-end quote, contract, invoice, collect, and revenue-recognize in customer currency. · _sales_ · Disjointed cross-border sales flow
77. **Cross-Border Subscription Billing** — Handles recurring foreign-currency subscriptions with dunning and FX-aware revenue. · _sales_ · SaaS exporters lack billing tools
78. **Marketplace Payout Reconciler** — Reconciles Amazon Global, Etsy, and similar foreign-marketplace payouts to net of fees and FX. · _finance_ · Marketplace exporters drown in payout files
79. **Cross-Border Refund Handler** — Processes foreign-customer refunds at original rate with FEMA-compliant outward documentation. · _customer_ · Refunds abroad are compliance traps
80. **Import Vendor Advance Tracker** — Monitors advance payments to foreign suppliers and matches against eventual imports per IDPMS. · _finance_ · Unliquidated advances breach FEMA
81. **Trade Finance Marketplace** — Connects SMBs to competing banks/NBFCs for LC, packing credit, and invoice discounting quotes. · _owner_ · Trade finance access limited and costly
82. **Export Invoice Discounting** — Sells foreign receivables to financiers for instant INR using verified eBRC data. · _finance_ · Working capital locked in exports
83. **Cross-Border Factoring** — Non-recourse factoring of export invoices with integrated ECGC-style buyer cover. · _finance_ · Factoring inaccessible to small exporters
84. **Supply-Chain Finance for Imports** — Extends payment terms to import suppliers via financier early-pay in their currency. · _finance_ · Import payment terms squeeze cash
85. **Real-Time Cross-Border Status Wall** — Live board of every international payment, shipment, and document across the business. · _owner_ · No single cross-border cockpit
86. **Corridor Cost Benchmark** — Compares your fees and speed to anonymized peers per currency corridor. · _finance_ · No benchmark for cross-border cost
87. **Currency Cash-Flow Forecast** — Forecasts cash by currency, predicting future FX needs and conversion timing. · _finance_ · FX liquidity planning absent
88. **Multi-Currency Budgeting** — Sets and tracks budgets per entity and currency with consolidated variance reporting. · _finance_ · Budgets break across currencies
89. **Tariff & Trade-War Alert Feed** — Notifies of new tariffs, quotas, or sanctions affecting your HSN-by-country flows. · _owner_ · Tariff shocks catch SMBs off guard
90. **Free-Trade-Agreement Optimizer** — Identifies FTAs (CEPA, RCEP-adjacent) that cut duty and generates certificates of origin. · _ops_ · FTA benefits left on the table
91. **Certificate of Origin Issuer** — Auto-prepares preferential and non-preferential COOs on the DGFT eCoO platform. · _ops_ · COO issuance is manual
92. **Incoterms Advisor** — Recommends Incoterms 2030 per deal and clarifies cost/risk transfer to both parties. · _sales_ · Incoterms misunderstood, causing disputes
93. **Cross-Border Dispute Resolver** — Logs trade disputes and routes to ODR or arbitration with document bundles ready. · _ops_ · Foreign disputes hard to escalate
94. **Multilingual Invoice & Statement** — Renders documents in the buyer's language and currency with localized tax notes. · _customer_ · Language barriers slow payment
95. **Global Compliance Calendar** — Unified deadline tracker for FEMA, TP, CbCR, VAT, and host-country filings worldwide. · _CA_ · Cross-border deadlines scattered
96. **Country Expansion Wizard** — Step-by-step playbook to register an entity, bank, and tax presence in a target country. · _owner_ · Expansion knowledge gatekept by consultants
97. **Jurisdiction Tax-Efficiency Comparator** — Ranks candidate countries by tax, treaty, and ease for the next entity. · _owner_ · Entity-location choice made blindly
98. **Digital-Nomad Compliance Tracker** — Tracks founder/staff day-counts across countries to manage tax-residency triggers. · _owner_ · Travel days silently create tax bills
99. **Cross-Border ESG Trade Reporting** — Captures CBAM and scope-3 emissions data for EU-bound exports. · _CA_ · CBAM reporting now mandatory for EU trade
100. **Carbon-Adjusted Landed Cost** — Adds CBAM carbon levies into import/export landed-cost projections. · _finance_ · Carbon tariffs ignored in pricing
101. **Stablecoin Treasury Rail** — Holds and settles in regulated stablecoins to bypass slow corridors where permitted. · _finance_ · Banking rails too slow and costly
102. **CBDC Cross-Border Corridor** — Settles instantly via linked e-rupee and partner-country CBDC bridges (BIS mBridge-style). · _finance_ · SWIFT settlement takes days
103. **Programmable Trade-Finance Contracts** — Smart contracts that auto-release payment when shipment and document conditions verify. · _finance_ · LC settlement is slow and manual
104. **Tokenized Invoice Exchange** — Tokenizes export receivables for fractional global financing on a regulated ledger. · _finance_ · Receivable financing illiquid
105. **Conditional Cross-Border Escrow** — Holds funds in programmable escrow released on IoT-verified delivery milestones. · _customer_ · Trust gap in first-time foreign deals
106. **Autonomous FX Hedging Agent** — AI agent that hedges exposures continuously within owner-set risk and cost limits. · _finance_ · Treasury teams unaffordable for SMBs
107. **Autonomous Treasury Agent** — Sweeps idle multi-currency cash into optimal yield while preserving liquidity needs. · _finance_ · Idle FX balances earn nothing
108. **Self-Filing FEMA Compliance Agent** — Detects each cross-border event and files the right RBI form end-to-end, zero-touch. · _CA_ · FEMA filing is reactive and manual
109. **Agentic Trade-Document Assembler** — Reads POs and packing data to generate the full export document set autonomously. · _ops_ · Document prep eats days per shipment
110. **Predictive Realization-Risk Agent** — Forecasts which export payments will be late and proactively negotiates or insures them. · _finance_ · Realization defaults discovered too late
111. **Counterparty Negotiation Agent** — AI negotiates payment terms and FX clauses agent-to-agent with the buyer's finance AI. · _sales_ · Cross-border term negotiation slow
112. **Global Pricing Autopilot** — Continuously reprices export catalogs by currency, tariff, and competitor moves in real time. · _sales_ · Static foreign prices erode margin
113. **Autonomous Corridor Router** — Splits each payment across the cheapest live mix of fiat, CBDC, and stablecoin rails. · _finance_ · Single-rail payments overpay
114. **Sanctions-Aware Payment Firewall** — AI blocks and explains any transaction breaching live global sanctions before it sends. · _finance_ · Sanctions breaches carry severe penalty
115. **Real-Time Transfer-Pricing Agent** — Adjusts intercompany prices transaction-by-transaction to stay within arm's-length live. · _CA_ · Year-end TP true-ups are risky
116. **Autonomous Entity-Setup Agent** — Registers a foreign subsidiary, bank, and tax IDs end-to-end with regulators in days. · _owner_ · Entity setup takes months of consultants
117. **Global Payroll Autopilot** — Runs, files, and pays multi-country payroll fully autonomously each cycle with statutory compliance. · _ops_ · Global payroll still needs manual checks
118. **Predictive Tariff-War Simulator** — Models sourcing and pricing impact of geopolitical scenarios on your supply chain. · _owner_ · No tool simulates trade-policy shocks
119. **Quantum FX Risk Engine** — Quantum-accelerated Monte-Carlo on multi-currency exposure under thousands of scenarios. · _finance_ · Classical risk models too coarse
120. **Cross-Border Digital Twin** — A live simulation of all global flows to test FX, tariff, and routing decisions before acting. · _owner_ · Decisions made without simulation
121. **Ambient Trade-Compliance Layer** — Background AI that keeps every shipment continuously FEMA/DGFT-clean without prompts. · _CA_ · Compliance is checked, not continuous
122. **Agent-to-Agent Cross-Border Settlement** — Buyer and seller AIs settle, document, and remit autonomously across borders. · _finance_ · Settlement still needs human steps
123. **Self-Optimizing Repatriation Agent** — Continuously times profit repatriation for best FX and lowest tax across the group. · _finance_ · Repatriation timing left to humans
124. **Global Liquidity Pooling Agent** — Notionally pools group cash across currencies and lends internally to cut external borrowing. · _finance_ · Cash trapped in subsidiaries
125. **Autonomous Customs Clearance** — AI files entries, pays duty, and clears goods with customs agent-to-agent in real time. · _ops_ · Customs clearance still has delays
126. **Predictive Working-Capital-for-Exports Agent** — Pre-arranges packing credit before orders land based on forecast pipeline. · _finance_ · Funding arrives after the need
127. **Cross-Border Fraud Prevention AI** — Detects invoice-redirection and BEC fraud on foreign payments before release. · _finance_ · Wire fraud devastates SMBs
128. **Neural Treasury Dashboard** — Spatial/AR cockpit showing global cash, exposure, and risk as a manipulable 3D model. · _owner_ · Flat dashboards hide complexity
129. **Voice-Driven Global Treasury** — Ask in any language "hedge my dollar exposure for Q3" and the agent executes. · _owner_ · Treasury actions need expert interfaces
130. **Self-Healing Reconciliation Agent** — Detects and fixes FX, FIRC, and intercompany mismatches before period close, autonomously. · _finance_ · Mismatches surface at audit
131. **Programmable Export-Incentive Claimer** — Smart contracts auto-claim RoDTEP, drawback, and refunds the instant eBRC verifies. · _finance_ · Incentives claimed late or missed
132. **Geopolitical Resilience Agent** — Reroutes suppliers, payments, and entities ahead of sanctions or conflict disruptions. · _owner_ · Supply chains fragile to shocks
133. **Autonomous Multi-Jurisdiction Filer** — One agent files every global return (VAT, TP, CbCR, FEMA) on every deadline, worldwide. · _CA_ · Global filing burden overwhelming
134. **Cross-Border Carbon-Credit Trader** — Buys, sells, and settles tokenized carbon credits to offset CBAM liability automatically. · _CA_ · Carbon offsetting manual and opaque
135. **Universal Currency Settlement Fabric** — Settles any-to-any currency instantly via a unified ledger abstracting all rails. · _finance_ · Corridor fragmentation persists
136. **Sovereign-Data Cross-Border Vault** — Stores trade and finance data in jurisdiction-compliant enclaves honoring DPDP and GDPR. · _CA_ · Data-sovereignty rules conflict across borders
137. **Predictive FEMA Audit-Defense Agent** — Simulates RBI/ED scrutiny, pre-assembles defenses, and closes gaps before any notice. · _CA_ · FEMA notices caught unprepared
138. **Autonomous Global Expansion Orchestrator** — Plans and executes full market entry: entity, banking, payroll, tax, compliance, hands-free. · _owner_ · Expansion needs an army of advisors
139. **Self-Governing Group Treasury** — A constitutional AI treasury that runs all global finance within board-set policy autonomously. · _owner_ · No autonomous group-level treasury exists
140. **Borderless Commerce Singularity** — Fully ambient layer where every cross-border trade, payment, and filing happens invisibly and instantly. · _owner_ · Cross-border friction still defines global SMB trade
