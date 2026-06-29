# GST & Indirect Tax Intelligence (140 features)
> Turning India's most punishing compliance burden into a self-driving, zero-touch indirect-tax engine that files, reconciles, defends, and optimizes GST autonomously.

1. **One-Click GSTR-1 Draft** — Auto-builds GSTR-1 from sales ledger with B2B/B2C/HSN summaries pre-filled and validated. · _finance_ · SMB pain: manual return prep eats hours monthly
2. **GSTR-3B Auto-Reconciler** — Reconciles 3B liability against 1 and 2B before filing, flagging mismatches that trigger notices. · _CA_ · SMB pain: 3B can't be revised, errors are costly
3. **GSTR-2B ITC Matcher** — Line-level match of purchase register to GSTR-2B with fuzzy invoice/amount tolerance and exception queue. · _finance_ · SMB pain: ITC mismatch is #1 notice trigger
4. **Vendor Non-Upload Tracker** — Detects suppliers who haven't filed GSTR-1, quantifies blocked ITC, and nudges them automatically. · _finance_ · SMB pain: vendors don't upload, ITC stuck
5. **E-Invoice IRN Generator** — Generates IRN and signed QR via IRP at invoice creation, embedding it on the PDF instantly. · _ops_ · Competitor gap: many tools bolt-on e-invoicing late
6. **30-Day Reporting Guard** — Blocks invoices nearing the 30-day e-invoice reporting deadline and auto-reports before lockout. · _finance_ · SMB pain: new 30-day IRP rule sweeps in MSMEs
7. **E-Way Bill Auto-Create** — Generates EWB from invoice with distance, vehicle, and transporter auto-filled from past trips. · _ops_ · SMB pain: manual EWB delays dispatch
8. **EWB Expiry Alerts** — Tracks validity by distance and pings to extend before goods are detained in transit. · _ops_ · SMB pain: expired EWB means seizure and penalty
9. **HSN/SAC Auto-Classifier** — Suggests correct HSN/SAC from item description with confidence score and rate lookup. · _finance_ · SMB pain: wrong HSN draws scrutiny
10. **GST Rate Finder** — Live database of current rates, cess, and exemptions searchable by product or HSN with effective dates. · _sales_ · SMB pain: rate confusion on quotes
11. **Place-of-Supply Engine** — Determines IGST vs CGST/SGST automatically from buyer/seller state and supply type. · _finance_ · SMB pain: wrong tax head on interstate sales
12. **Multi-GSTIN Console** — Single dashboard managing filings, ITC, and liability across all state registrations of one entity. · _finance_ · Competitor gap: multi-GSTIN poorly handled
13. **RCM Detector** — Flags purchases liable to reverse charge (legal, GTA, imports) and auto-creates self-invoices. · _CA_ · SMB pain: missed RCM means denied ITC and interest
14. **Composition Scheme Tracker** — Monitors turnover against composition limits and generates CMP-08 quarterly payments. · _owner_ · SMB pain: tiny firms misuse composition
15. **QRMP Manager** — Handles quarterly returns with monthly PMT-06 challans and IFF for B2B invoice upload. · _finance_ · SMB pain: QRMP rules confuse small filers
16. **LUT Reminder & Filer** — Auto-files Letter of Undertaking annually so exporters ship zero-rated without IGST blockage. · _finance_ · SMB pain: lapsed LUT halts exports
17. **Export Refund Tracker** — Tracks IGST/ITC refund applications (RFD-01) by status, ARN, and provisional sanction. · _finance_ · SMB pain: refund cash stuck for months
18. **SEZ Supply Handler** — Tags SEZ sales as zero-rated, manages bond/LUT, and reconciles with shipping bills. · _finance_ · Competitor gap: SEZ flows rarely automated
19. **Customs & Import Duty Calc** — Computes BCD, IGST, cess, and social welfare surcharge on imports from bill of entry. · _ops_ · SMB pain: import duty math is error-prone
20. **Bill-of-Entry ITC Import** — Pulls import IGST credit from ICEGATE into GSTR-2B reconciliation automatically. · _finance_ · SMB pain: import ITC manually keyed
21. **Notice Inbox** — Centralizes DRC-01, ASMT-10, and ADT notices from the GST portal with deadline countdowns. · _CA_ · SMB pain: notices missed in portal clutter
22. **DRC-03 Auto-Drafter** — Prepares voluntary payment drafts when discrepancies are found, computing tax plus interest. · _CA_ · SMB pain: responding to notices is daunting
23. **Interest & Late-Fee Estimator** — Calculates 18%/24% interest and per-day late fees on delayed filings before they balloon. · _finance_ · SMB pain: ₹25k errors plus 24% interest
24. **Filing Calendar** — Personalized due-date calendar across all returns, GSTINs, and schemes with escalating reminders. · _finance_ · Compliance overload across many returns
25. **GSTR-9 Annual Builder** — Assembles annual return from twelve months of 1/3B with auto-computed reconciliation tables. · _CA_ · SMB pain: annual return is a manual nightmare
26. **GSTR-9C Reconciliation** — Generates the reconciliation statement linking audited financials to GST returns with auditor sign-off. · _CA_ · SMB pain: 9C reconciliation is opaque
27. **ITC Reversal Calculator** — Computes Rule 42/43 reversals for exempt supplies and capital goods automatically. · _CA_ · SMB pain: common-credit reversal is complex
28. **180-Day Payment Rule Watch** — Flags supplier invoices unpaid past 180 days requiring ITC reversal, then reclaim on payment. · _finance_ · SMB pain: silent ITC reversal liability
29. **Blocked Credit Guard** — Auto-tags Section 17(5) ineligible ITC (motor vehicles, food, gifts) so it's never claimed. · _finance_ · SMB pain: wrongly claimed ITC reversed with interest
30. **GSTIN Validator** — Verifies any GSTIN in real time for validity, filing status, and registration type before transacting. · _sales_ · SMB pain: dealing with fake/cancelled GSTINs
31. **Cancelled-Vendor Alert** — Warns when a supplier's GSTIN is suspended or cancelled, protecting ITC claims. · _finance_ · SMB pain: ITC denied on cancelled-dealer buys
32. **E-Invoice Cancellation Window** — Tracks the 24-hour IRN cancellation window and lets you void before it locks. · _ops_ · SMB pain: stuck with wrong IRN
33. **Credit/Debit Note Linker** — Links CDNs to original IRNs, adjusts GSTR-1, and ensures the buyer's 2B reflects them. · _finance_ · SMB pain: unlinked notes break recon
34. **Amendment Tracker** — Manages B2B/B2C amendments across return periods within the legal amendment window. · _CA_ · SMB pain: amendment deadlines missed
35. **Nil-Return Auto-Filer** — Files nil GSTR-1/3B via SMS/portal automatically for dormant GSTINs. · _owner_ · SMB pain: forgotten nil returns accrue late fees
36. **Turnover-Threshold Monitor** — Tracks aggregate turnover toward registration, e-invoice, and audit thresholds with early warnings. · _owner_ · SMB pain: crossing thresholds unknowingly
37. **Cess Calculator** — Computes compensation cess on luxury/sin goods (autos, tobacco, coal) with correct rates. · _finance_ · Competitor gap: cess often ignored
38. **TCS/TDS-GST Reconciler** — Reconciles e-commerce TCS (GSTR-8) and GST-TDS (GSTR-7) credits into the cash ledger. · _finance_ · SMB pain: marketplace TCS hard to track
39. **Cash & Credit Ledger Viewer** — Live electronic cash and credit ledger balances with utilization simulation before filing. · _finance_ · SMB pain: ledger balances opaque on portal
40. **PMT-09 Fund Transfer** — Moves wrongly-paid amounts between cash-ledger heads (CGST↔IGST) with one tap. · _finance_ · Competitor gap: PMT-09 rarely surfaced
41. **Invoice-Level ITC Aging** — Shows how long each ITC claim has been pending vendor upload, prioritizing follow-ups. · _finance_ · SMB pain: ITC aging invisible
42. **HSN-Wise Sales Report** — Generates the mandatory HSN summary report for GSTR-1 with quantity and UQC validation. · _finance_ · SMB pain: HSN summary errors
43. **Anti-Profiteering Check** — Verifies rate-cut benefits are passed to customers, documenting compliance for audits. · _CA_ · Competitor gap: anti-profiteering ignored
44. **GST Health Score** — Single 0–100 compliance score from filing timeliness, ITC match rate, and notice history. · _owner_ · SMB pain: no view of compliance posture
45. **Vendor Compliance Rating** — Scores each supplier on filing regularity so procurement favors ITC-safe vendors. · _ops_ · SMB pain: bad vendors cost you ITC
46. **Branch-Transfer Stock Invoicing** — Auto-generates tax invoices for inter-state stock transfers between own GSTINs. · _ops_ · SMB pain: stock transfer GST overlooked
47. **ISD Credit Distributor** — Distributes common input service credit across branches per Input Service Distributor rules. · _CA_ · Competitor gap: ISD mechanism unsupported
48. **Job-Work Tracker (ITC-04)** — Tracks goods sent to job workers and files ITC-04 to avoid deemed-supply tax. · _ops_ · SMB pain: job-work returns forgotten
49. **Pure-Agent Expense Tagger** — Identifies reimbursable pure-agent expenses excluded from taxable value. · _CA_ · SMB pain: over-taxing reimbursements
50. **Mixed/Composite Supply Classifier** — Determines principal supply and applicable rate for bundled goods/services. · _finance_ · SMB pain: bundling rate disputes
51. **GST Refund Eligibility Scanner** — Detects inverted-duty, export, and excess-payment refund opportunities you're missing. · _finance_ · SMB pain: refunds left unclaimed
52. **Inverted-Duty Refund Builder** — Computes and files Rule 89(5) refund for accumulated ITC under inverted structure. · _CA_ · SMB pain: inverted-duty refunds complex
53. **e-Commerce Operator GST Suite** — Handles TCS collection, GSTR-8 filing, and supplier reconciliation for marketplace sellers. · _finance_ · Competitor gap: ECO obligations niche
54. **OIDAR & Import-of-Service Tagger** — Flags imported digital services and foreign vendor payments liable to RCM. · _finance_ · SMB pain: cross-border service tax missed
55. **GST Audit Trail Vault** — Immutable, timestamped log of every return, amendment, and payment for departmental audit. · _CA_ · Future trend: audit-ready data sovereignty
56. **Litigation Case Manager** — Tracks appeals, hearings, pre-deposits, and orders across GST tribunals with document binder. · _CA_ · SMB pain: litigation tracking chaotic
57. **Pre-Deposit Optimizer** — Computes mandatory appeal pre-deposit and suggests cash vs credit ledger funding. · _CA_ · SMB pain: pre-deposit math unclear
58. **Show-Cause Reply Drafter** — Drafts structured SCN responses citing relevant sections, circulars, and case law. · _CA_ · SMB pain: SCN replies need legal help
59. **Circular & Notification Feed** — Curated, plain-language alerts on CBIC notifications affecting your HSNs and sector. · _owner_ · SMB pain: can't track endless GST changes
60. **AATO-Based Feature Gating** — Auto-enables e-invoicing, audit, and B2C QR features as turnover crosses each slab. · _finance_ · SMB pain: missing slab-triggered obligations
61. **Dynamic QR for B2C** — Generates dynamic UPI-linked QR on B2C invoices above threshold for compliant collection. · _sales_ · SMB pain: B2C dynamic QR mandate
62. **GSTR-1 vs E-Invoice Auto-Sync** — Pushes all generated IRNs into GSTR-1 so reported sales never diverge from e-invoices. · _finance_ · SMB pain: IRN-vs-return mismatch notices
63. **Negative-Liability Adjuster** — Manages composition negative liability and carry-forward in the cash ledger. · _finance_ · Competitor gap: edge case unhandled
64. **Provisional ITC Forecaster** — Predicts next month's claimable ITC from vendor filing patterns for cash planning. · _finance_ · SMB pain: ITC unpredictability hurts cash
65. **GST Liability Forecaster** — Projects monthly net GST payable from sales pipeline so cash is reserved early. · _owner_ · SMB pain: GST payment surprises drain cash
66. **Working-Capital-Aware Filing** — Times QRMP/monthly choices and ITC use to minimize cash outflow given runway. · _finance_ · Future trend: tax woven into cash strategy
67. **Sector Benchmarking** — Compares your effective tax rate, ITC ratio, and notice rate against anonymized peers. · _owner_ · Competitor gap: no GST benchmarking exists
68. **Multi-State Nexus Mapper** — Recommends where new registrations are needed based on supply footprint and POS rules. · _finance_ · SMB pain: knowing where to register
69. **Reconciliation Confidence Bar** — Shows match confidence per invoice (exact/probable/disputed) with auto-accept thresholds. · _finance_ · SMB pain: recon is all-or-nothing today
70. **WhatsApp Filing Assistant** — File returns, check ITC, and pay GST by chatting in Hindi/regional language on WhatsApp. · _owner_ · Future trend: WhatsApp is 80% of SMB reach
71. **Voice GST Query** — Ask "How much GST do I owe this month?" by voice and get a spoken, sourced answer. · _owner_ · Future trend: ambient/voice interfaces
72. **Tally/Zoho GST Bridge** — Two-way sync pulling sales/purchase from Tally and pushing reconciled ITC back. · _CA_ · Competitor gap: 6M Tally users underserved on GST
73. **CA Collaboration Workspace** — Shared review queue where your CA approves returns, leaves notes, and e-signs filings. · _CA_ · SMB pain: messy CA handoffs over email
74. **Bulk Multi-Client Filer** — CAs file dozens of clients' returns in one batch with per-client exception flags. · _CA_ · Competitor gap: CA practice scale tooling thin
75. **Penalty-Risk Heatmap** — Visual heatmap of which obligations carry the highest near-term penalty exposure. · _owner_ · SMB pain: blind to where risk concentrates
76. **Self-Healing Invoice Validator** — Catches and fixes GSTIN, rate, and POS errors on invoices before IRN generation. · _ops_ · SMB pain: bad invoices propagate downstream
77. **Account-Aggregator ITC Cross-Check** — Uses AA bank data to verify supplier payments support claimed ITC. · _finance_ · Future trend: India DPI 2.0 / AA
78. **ONDC Tax Auto-Tagging** — Applies correct GST treatment to ONDC network orders by buyer/seller location automatically. · _sales_ · Future trend: ONDC commerce rails
79. **e-Rupee GST Settlement** — Pays GST liability directly in programmable CBDC earmarked for tax only. · _finance_ · Future trend: CBDC programmable money
80. **Notice Predictor** — ML model warns weeks before a likely ASMT-10/DRC-01 based on your mismatch pattern. · _CA_ · SMB pain: notices arrive as surprises
81. **Auto-Reconcile Background Agent** — Continuously matches new 2B data to books overnight, leaving only true exceptions by morning. · _finance_ · Future trend: agentic AI / self-driving books
82. **Vendor ITC-Recovery Bot** — Autonomously messages, escalates, and even debit-notes non-uploading vendors to recover blocked ITC. · _finance_ · SMB pain: chasing vendors is endless
83. **Zero-Touch GSTR-1 Filing** — Files GSTR-1 with no human step once confidence passes threshold, logging every decision. · _finance_ · Future trend: zero-touch compliance
84. **Zero-Touch 3B with Guardrails** — Auto-files 3B after agent verifies 1↔2B↔books reconcile, pausing only on anomalies. · _finance_ · Future trend: autonomous filing
85. **Autonomous Refund Agent** — Detects, prepares, files, and follows up on every eligible refund without prompting. · _finance_ · SMB pain: refunds need constant chasing
86. **Self-Defending Notice Agent** — On a notice, the agent assembles evidence, drafts a reply, and routes it to your CA in minutes. · _CA_ · Future trend: agentic litigation defense
87. **Continuous Compliance Score Engine** — Real-time GST health recomputed on every transaction, not monthly. · _owner_ · Future trend: ambient/real-time finance
88. **Programmable ITC Rules** — Owners write plain-English ITC policies the engine enforces on every purchase automatically. · _finance_ · Future trend: programmable tax
89. **Agent-to-Agent ITC Reconciliation** — Your GST agent negotiates invoice matches directly with each supplier's agent. · _finance_ · Future trend: agent-to-agent commerce
90. **Real-Time ITC Settlement Ledger** — ITC credited the instant a supplier reports, settling between agents on a shared ledger. · _finance_ · Future trend: real-time programmable settlement
91. **Digital-Twin Tax Simulator** — Simulates GST impact of price, sourcing, or location changes on a live model of your business. · _owner_ · Future trend: business digital twin
92. **Predictive Liability Hedging** — Reserves and pre-funds future GST liability in a yield account until due. · _finance_ · Future trend: predictive treasury
93. **Smart-Contract GST Escrow** — Tax portion of each sale auto-locks in escrow and releases to government on filing. · _finance_ · Future trend: tokenized programmable money
94. **Self-Negotiating Rate Disputes** — Agent files, argues, and settles minor classification disputes within delegated authority. · _CA_ · Future trend: autonomous dispute resolution
95. **Ambient Compliance Whisper** — AR/heads-up display warns at point of quoting if a deal creates a GST registration or POS risk. · _sales_ · Future trend: spatial/neural interfaces
96. **Quantum ITC Fraud Modeler** — Quantum-accelerated detection of circular-trading and fake-invoice ITC fraud in your supply chain. · _CA_ · Future trend: quantum risk modeling
97. **Autonomous Multi-GSTIN Optimizer** — Continuously rebalances ITC and liability across all registrations to minimize blocked credit. · _finance_ · Future trend: autonomous tax treasury
98. **Self-Filing Annual Return Agent** — Compiles, reconciles, and files GSTR-9/9C end-to-end with CA only attesting. · _CA_ · Future trend: zero-touch annual compliance
99. **Carbon-Linked Tax Ledger** — Tracks GST alongside carbon/ESG levies in a unified indirect-tax ledger. · _owner_ · Future trend: ESG/carbon accounting
100. **Cross-Border GIFT-City Tax Router** — Routes export/IFSC transactions through optimal zero-rated or concessional regimes. · _finance_ · Future trend: cross-border / GIFT-City
101. **Predictive HSN Drift Detector** — Flags when product evolution may have changed its correct HSN classification. · _CA_ · SMB pain: silent misclassification risk
102. **Litigation Outcome Predictor** — Estimates win probability and likely demand for a dispute from comparable adjudicated cases. · _CA_ · Future trend: predictive legal analytics
103. **Auto-Pre-Deposit Funder** — Reserves and pays appeal pre-deposit from a dedicated fund the moment an appeal is filed. · _finance_ · SMB pain: pre-deposit liquidity crunch
104. **Continuous Audit Readiness** — Maintains a perpetually export-ready audit file so departmental visits need zero prep. · _CA_ · SMB pain: audit prep is a scramble
105. **Supplier Onboarding GST Gate** — New vendors auto-verified for GSTIN validity, filing history, and ITC reliability before approval. · _ops_ · SMB pain: onboarding risky suppliers
106. **Dynamic POS for Mobile Services** — Resolves place of supply in real time for field/mobile services using geolocation. · _ops_ · SMB pain: POS for roving services unclear
107. **e-Way Bill Route Twin** — Predicts EWB validity needs from a live logistics twin, extending automatically before transit. · _ops_ · Future trend: digital twin logistics
108. **Self-Reconciling Import Ledger** — ICEGATE bill-of-entry data auto-flows into ITC with duty drawback tracked end-to-end. · _finance_ · SMB pain: import tax fully manual
109. **Composition-vs-Regular Optimizer** — Continuously computes whether composition or regular scheme saves more given your mix. · _owner_ · SMB pain: scheme choice left to guesswork
110. **Refund-Interest Claimer** — Auto-claims statutory 6% interest when refunds are delayed beyond 60 days. · _finance_ · Competitor gap: refund interest never claimed
111. **Multi-Lingual Notice Translator** — Translates and explains any GST notice in the owner's language with action steps. · _owner_ · SMB pain: notices in legalese
112. **Anomaly-Triggered Human Handoff** — Autonomous agent escalates to CA only when confidence drops, with full context attached. · _CA_ · Future trend: human-in-the-loop agents
113. **GST Cash-Flow Synchronizer** — Aligns GST payment dates with receivable inflows so tax never causes an overdraft. · _finance_ · SMB pain: GST timing strains cash
114. **Reverse-Charge Self-Invoice Vault** — Auto-generates, numbers, and archives RCM self-invoices and payment vouchers. · _finance_ · SMB pain: RCM documentation gaps
115. **Sectoral Rate-Change Impact Sim** — On any GST Council rate change, instantly models margin and pricing impact across SKUs. · _owner_ · SMB pain: rate changes blindside pricing
116. **Fake-ITC Network Graph** — Maps your purchase chain to detect if any upstream supplier is a flagged fake-invoice node. · _CA_ · SMB pain: caught in others' fraud chains
117. **Auto-Generated Reconciliation Certificate** — Produces a defensible ITC reconciliation certificate for any period on demand. · _CA_ · SMB pain: proving recon to auditors
118. **Threshold-Aware Pricing Advisor** — Warns when a quote pushes turnover past a costly compliance slab and suggests timing. · _sales_ · SMB pain: unaware slab crossings
119. **GSTR-2A vs 2B Drift Analyzer** — Explains differences between 2A and 2B and which to trust for each claim. · _CA_ · SMB pain: 2A/2B confusion
120. **Continuous LUT & Bond Watch** — Monitors LUT validity, bond limits, and export obligations, renewing before lapse. · _finance_ · SMB pain: export doc lapses halt shipping
121. **Self-Optimizing Filing Schedule** — Agent picks monthly/QRMP, IFF timing, and payment dates to minimize cost and risk per GSTIN. · _finance_ · Future trend: autonomous tax optimization
122. **Programmable Vendor Payment Hold** — Smart contract releases vendor payment only after their GSTR-1 upload confirms your ITC. · _finance_ · Future trend: programmable conditional payment
123. **Real-Time Tax-on-Sale Settlement** — At point of sale, GST splits and remits to government instantly via programmable rails. · _finance_ · Future trend: real-time tax settlement
124. **Neural GST Co-Pilot** — Conversational agent answers any "what-if" GST question grounded in live books and current law. · _owner_ · Future trend: AI-CFO co-pilot
125. **Autonomous Classification Defender** — Maintains a living, citation-backed file justifying every HSN choice for audit defense. · _CA_ · Future trend: self-documenting compliance
126. **Cross-Entity Group GST Console** — Consolidates GST across all group companies with inter-company supply auto-elimination. · _CA_ · Competitor gap: group GST unmanaged
127. **Predictive Cess Liability** — Forecasts compensation-cess exposure for sin/luxury sellers and reserves funds. · _finance_ · Competitor gap: cess forecasting absent
128. **Self-Updating Compliance Genome** — Encodes your full obligation profile and auto-rewrites itself when law or turnover changes. · _owner_ · Future trend: living compliance model
129. **Agent-Negotiated Refund Acceleration** — Refund agent negotiates provisional sanction directly with the processing system. · _finance_ · Future trend: agent-to-system negotiation
130. **Zero-Knowledge GST Audit Proof** — Proves compliance to the department cryptographically without exposing full books. · _CA_ · Future trend: privacy / DPDP / ZK proofs
131. **Ambient Penalty Shield** — Background agent ensures no return, payment, or LUT ever lapses, guaranteeing zero late fees. · _owner_ · SMB pain: late fees from forgetfulness
132. **Self-Driving Multi-Year Litigation** — Agent manages an entire dispute lifecycle across years, escalating to CA only at decision points. · _CA_ · Future trend: autonomous long-horizon agents
133. **Tokenized ITC Marketplace** — Surplus, time-bound ITC tokenized and (where permitted) traded or pledged for working capital. · _finance_ · Future trend: tokenization of tax assets
134. **Predictive Audit-Selection Defense** — Models the department's risk-scoring to preemptively clean the exact flags that trigger audits. · _CA_ · Future trend: adversarial compliance modeling
135. **Spatial GST Command Center** — AR control room visualizing all GSTINs, ITC flows, and risks as a navigable 3D map. · _owner_ · Future trend: spatial/AR interfaces
136. **Self-Healing Return Amendments** — Agent detects post-filing errors and auto-stages corrective amendments within legal windows. · _finance_ · SMB pain: errors discovered too late
137. **Autonomous GST Treasury** — Single agent owns the full ITC-to-payment lifecycle, optimizing cash, credit, and timing continuously. · _finance_ · Future trend: fully autonomous tax function
138. **Federated Sector Tax Intelligence** — Learns optimal classification and ITC strategy from peers via privacy-preserving federated learning. · _CA_ · Future trend: federated learning / data sovereignty
139. **Pre-Cognitive Notice Resolution** — Resolves a probable dispute via voluntary DRC-03 before the department even issues a notice. · _CA_ · Future trend: pre-emptive compliance
140. **Self-Governing Indirect-Tax Constitution** — A codified, auditable rulebook the autonomous agents obey, that owners amend in plain language. · _owner_ · Future trend: governable autonomous finance
