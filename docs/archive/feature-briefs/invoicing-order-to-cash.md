# Invoicing & Order-to-Cash (140 features)
> The full revenue lifecycle reimagined: from quote to GST e-invoice to instant programmable settlement, with autonomous agents collapsing days-of-collection into seconds.

1. **One-tap GST invoice** — Create a compliant tax invoice from a contact in under five seconds on mobile. · _owner_ · beats Vyapar on speed
2. **Auto HSN/SAC suggester** — Predicts correct HSN/SAC code from item name and prior usage history. · _finance_ · SMB pain: wrong codes trigger notices
3. **Live IRP e-invoice push** — Generates IRN and signed QR by calling the Invoice Registration Portal at save time. · _finance_ · GST e-invoice 30-day rule
4. **30-day reporting guard** — Blocks back-dating beyond the IRP reporting window and warns before deadline lapses. · _CA_ · GST e-invoice mandate
5. **E-way bill auto-generation** — Creates the e-way bill alongside the invoice when goods value crosses threshold. · _ops_ · SMB pain: separate portal logins
6. **GSTIN auto-validate** — Verifies customer GSTIN against the GSTN registry and pre-fills legal name and address. · _finance_ · ClearTax parity
7. **Place-of-supply engine** — Determines CGST/SGST vs IGST automatically from buyer and seller state codes. · _finance_ · SMB pain: tax-split errors
8. **Reverse-charge flagging** — Detects RCM-applicable line items and labels the invoice with the correct declaration. · _CA_ · GST compliance gap
9. **UPI payment link on invoice** — Embeds a dynamic UPI QR and intent link so buyers pay from the PDF instantly. · _owner_ · India real-time payments
10. **Multi-rail payment links** — Single link offers UPI, cards, netbanking, wallets, and BNPL with lowest-fee routing. · _finance_ · RazorpayX parity, fee optimization
11. **Branded template studio** — Drag-and-drop invoice designer with logo, colors, fonts, and stored layout presets. · _owner_ · beats Refrens templates
12. **Quote-to-invoice convert** — Turns an accepted quotation into an invoice with one click, preserving line items. · _sales_ · SMB pain: re-keying
13. **Proforma invoice mode** — Issues a proforma for advance collection that auto-converts to tax invoice on payment. · _finance_ · export/advance workflows
14. **Recurring invoice scheduler** — Defines billing frequency, end date, and auto-issues invoices on cadence. · _finance_ · Zoho parity
15. **Subscription billing engine** — Manages plans, tiers, trials, proration, and dunning for SaaS-style SMBs. · _owner_ · future trend: recurring revenue
16. **Credit note workflow** — Issues GST-compliant credit notes linked to original invoice with ITC reversal tracking. · _CA_ · GST compliance
17. **Debit note workflow** — Generates debit notes for upward revisions with auto-linked tax adjustments. · _finance_ · GST compliance
18. **Delivery challan generator** — Creates challans for goods-in-transit without sale, convertible to invoice later. · _ops_ · Tally parity
19. **Multi-currency export invoice** — Bills in USD/EUR/AED with LUT/bond declaration and zero-rated export handling. · _finance_ · GIFT-City/export gap
20. **Live FX rate lock** — Pins the RBI reference rate at invoice date for accurate INR equivalent reporting. · _finance_ · cross-border trend
21. **Auto late-fee accrual** — Applies contractual interest on overdue invoices daily per agreed rate. · _finance_ · SMB pain: late payments
22. **Customer self-service portal** — Buyers view, download, dispute, and pay all their invoices from one branded link. · _customer_ · future trend: self-service
23. **Usage/metered billing** — Ingests usage events and rates them into period-end invoices for consumption models. · _owner_ · future trend: metered revenue
24. **WhatsApp invoice delivery** — Sends invoice PDF and pay link over WhatsApp with read receipts. · _sales_ · WhatsApp moat (80% market)
25. **WhatsApp pay-confirm bot** — Buyer replies "paid" with screenshot; bot reconciles against bank feed. · _customer_ · India messaging-first
26. **Bulk invoice run** — Issues hundreds of invoices from a spreadsheet or recurring list in one batch. · _finance_ · SMB pain: month-end load
27. **Smart due-date suggester** — Recommends payment terms based on this customer's historic payment behavior. · _finance_ · cash-flow optimization
28. **Partial payment tracking** — Records installments against an invoice and updates outstanding balance in real time. · _finance_ · SMB pain
29. **Advance/retention handling** — Tracks advances received and retention held against project invoices. · _finance_ · construction/services gap
30. **TDS auto-deduction display** — Shows expected TDS deduction by section so the buyer remits the correct net. · _CA_ · compliance overload
31. **TCS auto-application** — Applies TCS on applicable sales (scrap, e-commerce) with correct rates and ledgers. · _CA_ · GST/income-tax gap
32. **Invoice numbering rules** — Enforces financial-year-prefixed, gap-free, branch-wise numbering series. · _CA_ · GST audit requirement
33. **Multi-branch/GSTIN billing** — Issues invoices per registered place of business with consolidated reporting. · _finance_ · multi-state SMB gap
34. **Item-level discount + tax** — Applies line discounts before GST with transparent breakup on the invoice. · _sales_ · SMB pain: discount errors
35. **Round-off compliance** — Auto-rounds invoice total per GST rules and books the round-off ledger entry. · _CA_ · Tally parity
36. **PDF + e-invoice JSON export** — Downloads both human PDF and the IRP JSON for any invoice instantly. · _CA_ · audit/portal needs
37. **Payment reminder cadence** — Auto-sends polite-to-firm reminder ladder over email, SMS, and WhatsApp. · _finance_ · SMB pain: chasing payments
38. **Dunning escalation tree** — Routes persistent non-payers to phone, legal-notice draft, and collections handoff. · _finance_ · collections gap
39. **Customer credit limit** — Sets per-buyer credit ceilings and blocks new invoices when exceeded. · _finance_ · receivables risk
40. **Aging-based hold** — Pauses fulfillment when a customer crosses an overdue-bucket threshold. · _ops_ · cash-flow protection
41. **Quote approval chain** — Routes large quotes through internal approval before sending to the buyer. · _sales_ · SMB governance
42. **E-signature on quotes** — Buyers accept quotes with a legally binding click-to-sign and timestamp. · _customer_ · future trend: digital acceptance
43. **Stripe-style hosted invoice page** — Each invoice gets a live web page with status, pay button, and chat. · _customer_ · global UX parity
44. **Invoice OCR import** — Photograph a handwritten or legacy bill; AI extracts and structures it into the system. · _owner_ · SMB pain: paper books
45. **Voice-dictated invoice** — Speak the customer, items, and amounts in Hindi/regional language to draft an invoice. · _owner_ · neural/voice interface
46. **Item catalog with price lists** — Maintains products with tiered, customer-specific, and seasonal price lists. · _sales_ · B2B pricing complexity
47. **Inventory-linked invoicing** — Decrements stock and blocks overselling when an invoice is raised. · _ops_ · Tally inventory depth
48. **Barcode/QR scan billing** — Scan product barcodes to build the invoice line items at point of sale. · _ops_ · retail SMB gap
49. **POS-to-invoice sync** — Consolidates counter sales into GST invoices and B2C summaries automatically. · _ops_ · retail compliance
50. **ONDC order ingestion** — Pulls ONDC marketplace orders and raises matching tax invoices automatically. · _ops_ · India DPI 2.0
51. **Marketplace settlement match** — Reconciles Amazon/Flipkart settlement reports against issued invoices. · _finance_ · e-commerce SMB pain
52. **GSTR-1 auto-prep** — Compiles all sales invoices into a ready-to-file GSTR-1 with error pre-checks. · _CA_ · ClearTax parity
53. **B2B vs B2C auto-split** — Classifies invoices for GSTR-1 tables (B2B, B2CL, B2CS) without manual sorting. · _CA_ · filing accuracy
54. **e-Invoice cancellation window** — Cancels IRN within the 24-hour window and reissues cleanly. · _finance_ · GST rule
55. **Duplicate invoice detector** — Flags likely duplicate billing to the same customer for the same work. · _finance_ · revenue-leak prevention
56. **Customer statement of account** — Generates a running ledger of all invoices, payments, and balance per buyer. · _finance_ · receivables clarity
57. **Multi-language invoices** — Renders invoices in regional languages for buyer comprehension. · _customer_ · Bharat market reach
58. **Attachment bundling** — Staples PO, delivery proof, and timesheets to the invoice for dispute-proof billing. · _ops_ · dispute reduction
59. **PO matching** — Matches invoice to the buyer's purchase order and flags quantity/price mismatches. · _finance_ · B2B 3-way match
60. **Milestone billing** — Splits a contract into milestone-triggered invoices with completion gates. · _sales_ · project/services gap
61. **Time-and-materials billing** — Converts logged hours and expenses into a detailed professional-services invoice. · _finance_ · agency SMB gap
62. **Tip/service-charge handling** — Adds service charge and gratuity lines with correct GST treatment for hospitality. · _ops_ · sector-specific gap
63. **QR-only kirana mode** — Lightweight "khata + UPI QR" billing for micro-merchants with no formal invoicing. · _owner_ · Khatabook/OkCredit beat
64. **Offline-first billing** — Creates and queues invoices without internet, syncing IRN when connectivity returns. · _ops_ · India connectivity gap
65. **Invoice financing offer** — Surfaces a one-click advance against any unpaid invoice via embedded lenders. · _owner_ · embedded finance / KredX beat
66. **Receivables-backed credit line** — Revolving line sized live to total verified outstanding invoices. · _owner_ · OCEN/cash-flow lending
67. **Dynamic early-pay discount** — Offers buyers a sliding discount to pay early, optimizing the seller's cash position. · _finance_ · Cashflo beat
68. **Auto-reconciliation engine** — Matches incoming bank/UPI credits to open invoices using amount, UTR, and ref. · _finance_ · SMB pain: manual recon
69. **Account Aggregator pay-proof** — Verifies buyer payment via AA bank-statement consent, not screenshots. · _finance_ · India DPI 2.0
70. **Dispute resolution thread** — In-portal chat where buyer raises line disputes and seller resolves with audit trail. · _customer_ · dispute-cycle pain
71. **Refund link issuance** — Pushes refunds back to the original payment instrument with a tracked status link. · _customer_ · post-sale trust
72. **Sales-tax for global SaaS** — Computes US sales tax, EU VAT, and UK VAT for SMBs selling cross-border. · _finance_ · global expansion gap
73. **GIFT-City/IFSC invoicing** — Issues IFSC-unit invoices with the special tax and forex regime applied. · _CA_ · cross-border trend
74. **e-Rupee (CBDC) settlement** — Accepts programmable e-rupee with conditions encoded into the payment. · _finance_ · CBDC/programmable money
75. **Smart-contract escrow invoice** — Holds buyer funds in escrow, releasing on verified delivery oracle event. · _customer_ · tokenization trend
76. **Tokenized invoice marketplace** — Fractionalizes a verified invoice into tradable tokens for instant liquidity. · _owner_ · future: invoice tokenization
77. **Request-to-Pay push** — Sends a UPI/NPCI Request-to-Pay so buyers approve in their own banking app. · _customer_ · real-time/RtP trend
78. **Carbon line on invoice** — Attaches the embodied carbon footprint of goods sold for ESG-aware buyers. · _customer_ · ESG/carbon accounting
79. **DPDP-compliant data vault** — Stores customer billing data with consent ledger and erasure-on-request. · _CA_ · data sovereignty/DPDP
80. **Fraud-scored invoices** — Flags anomalous invoices (unusual buyer, amount, timing) before they leave. · _finance_ · fraud prevention
81. **Quantum-hard invoice signing** — Signs every invoice with post-quantum cryptography for long-term integrity. · _CA_ · quantum risk trend
82. **Predictive cash-in forecast** — Projects when each open invoice will actually be paid from buyer behavior models. · _owner_ · digital-twin/cash-flow
83. **Collection priority scoring** — Ranks which overdue invoices to chase first by recovery likelihood and value. · _finance_ · collections efficiency
84. **Invoice health score** — Grades each invoice on dispute risk, paste-ability, and compliance completeness. · _finance_ · revenue assurance
85. **Auto credit-note on return** — Detects a sales return from inventory and drafts the matching credit note. · _ops_ · returns automation
86. **Subscription churn predictor** — Warns when a recurring customer is likely to cancel before the next cycle. · _owner_ · retention/recurring revenue
87. **Revenue recognition engine** — Spreads invoiced amounts across periods per Ind-AS/ASC-606 for accrual books. · _CA_ · accounting-standard gap
88. **Deferred revenue tracker** — Maintains the unearned-revenue ledger for prepaid subscriptions automatically. · _finance_ · SaaS accounting gap
89. **Multi-entity intercompany billing** — Auto-generates mirrored invoices between group companies with elimination tags. · _CA_ · group SMB gap
90. **Buyer ERP punch-out** — Pushes invoices directly into large buyers' SAP/Ariba portals via PEPPOL/standard formats. · _ops_ · enterprise-buyer gap
91. **Negotiated-terms memory** — Remembers each buyer's agreed price, terms, and discounts and applies them automatically. · _sales_ · relationship continuity
92. **Invoice A/B template testing** — Tests which template design and wording gets invoices paid fastest. · _finance_ · DSO optimization
93. **Geo-fenced field invoicing** — Lets delivery staff invoice on-site, auto-tagging GPS as delivery proof. · _ops_ · field-sales gap
94. **Split-payment routing** — Splits a single buyer payment across seller, sub-vendor, and tax in one settlement. · _finance_ · marketplace/programmable money
95. **Loyalty/credit redemption** — Applies accrued buyer loyalty points or store credit at invoice time. · _customer_ · retention gap
96. **Seasonal billing autopilot** — Adjusts recurring invoice timing/amounts around festivals and known demand cycles. · _owner_ · seasonal-swing pain
97. **Buyer creditworthiness check** — Pulls buyer's AA/GST cash-flow signals to set safe terms before invoicing. · _finance_ · underwriting moat
98. **Auto-suspend on default** — Pauses a defaulting buyer's subscription and notifies sales for recovery. · _ops_ · revenue protection
99. **Invoice-to-GL auto-post** — Posts every invoice to the correct ledgers in real time, no journal entry. · _CA_ · self-driving books
100. **Natural-language invoice query** — Ask "who owes me over 60 days?" and get a ranked, actionable answer. · _owner_ · agentic AI / Brex parity
101. **AR aging digital twin** — A live simulation of receivables under what-if collection and discount strategies. · _owner_ · digital-twin trend
102. **Autonomous collections agent** — An AI agent that chases, negotiates, and settles overdue invoices end-to-end. · _finance_ · agentic AI
103. **Autonomous billing agent** — Watches fulfillment events and issues correct invoices with zero human touch. · _owner_ · 2090 self-driving O2C
104. **Agent-to-agent invoicing** — Seller's billing agent transacts directly with buyer's AP agent over a settlement protocol. · _ops_ · agent-to-agent commerce
105. **AI dispute negotiator** — Agent argues line-item disputes against the buyer's agent and proposes settlements. · _finance_ · agentic negotiation
106. **Self-pricing quote agent** — Generates optimal quotes by reading market rates, capacity, and win-probability live. · _sales_ · agentic pricing
107. **Instant settlement on issue** — Programmable money releases buyer funds the moment the e-invoice IRN is generated. · _finance_ · 2090 instant settlement
108. **Conditional smart invoice** — Invoice carries embedded rules: pay X on delivery, Y on acceptance, auto-executed. · _customer_ · programmable money
109. **Streaming/continuous billing** — Money flows per-second as a service is consumed rather than in periodic invoices. · _owner_ · future: real-time revenue
110. **Predictive pre-invoicing** — Drafts the invoice before work completes, predicting scope from project telemetry. · _finance_ · ambient finance
111. **Zero-touch GST filing close** — Agent files GSTR-1/3B from invoices with a single human approval, or fully autonomously. · _CA_ · zero-touch compliance
112. **Self-healing invoice errors** — Detects a rejected IRN or mismatch and auto-corrects and resubmits without a human. · _finance_ · self-driving books
113. **Ambient receivables nudge** — Surfaces collection actions inside the owner's day at the optimal moment, unprompted. · _owner_ · ambient finance
114. **Neural-interface invoice draft** — Compose and approve invoices via thought/AR gesture in a spatial workspace. · _owner_ · neural/spatial interface
115. **AR invoice over physical goods** — Point a device at shipped goods to see live invoice, payment, and dispute status. · _ops_ · spatial computing
116. **Holographic buyer ledger** — A spatial, walkable visualization of all receivables and their predicted timelines. · _owner_ · spatial interface
117. **Cross-border agent settlement** — Buyer and seller agents settle multi-currency invoices via tokenized FX in seconds. · _finance_ · cross-border + tokenization
118. **Reputation-staked invoicing** — Buyers stake on-chain reputation; trusted buyers get instant credit, defaulters lose standing. · _customer_ · trust/tokenization
119. **Dynamic terms by reputation** — Payment terms auto-tighten or loosen each invoice based on the buyer's live trust score. · _finance_ · adaptive credit
120. **Programmable late-fee oracle** — Late fees compute and self-collect via smart contract the instant an invoice ages past due. · _finance_ · programmable money
121. **Self-optimizing dunning AI** — Reinforcement-learning agent continuously tunes reminder timing/tone per buyer for max recovery. · _finance_ · agentic optimization
122. **Invoice as collateral, instantly** — Issuing an invoice auto-mints a financing offer priced live by an embedded-lender agent. · _owner_ · embedded finance 2090
123. **Demand-sensing billing** — Subscription prices flex automatically with real-time demand and the buyer's usage trajectory. · _owner_ · dynamic pricing
124. **Counterparty-twin pre-check** — Simulates the buyer's cash position via their digital twin before extending terms. · _finance_ · digital-twin underwriting
125. **Self-auditing invoice ledger** — A tamper-evident ledger that continuously proves GST and books reconcile, audit-ready. · _CA_ · zero-touch audit
126. **Carbon-settled invoices** — Settle a portion of invoice value in tokenized carbon credits for ESG-mandated buyers. · _customer_ · ESG/tokenization
127. **Multi-agent O2C orchestration** — Quote, billing, collections, and tax agents coordinate as one revenue swarm. · _owner_ · agentic orchestration
128. **Predictive bad-debt provisioning** — Auto-books expected-credit-loss provisions per invoice from default probability. · _CA_ · Ind-AS/forward-looking
129. **Voice-of-buyer sentiment** — Reads dispute and reminder conversations to predict and prevent payment friction. · _finance_ · AI relationship intelligence
130. **Instant invoice insurance** — One-tap trade-credit insurance on any invoice, priced live by a risk agent. · _owner_ · embedded insurance
131. **Self-negotiating early-pay market** — Buyer and seller agents auto-discover the optimal early-payment discount in real time. · _finance_ · agentic + dynamic discounting
132. **Quantum-optimized collection routing** — Solves the best multi-buyer, multi-channel collection plan across all constraints at once. · _finance_ · quantum optimization
133. **Sovereign data-residency billing** — Routes and stores each invoice in the jurisdiction its law requires, automatically. · _CA_ · data sovereignty
134. **Federated buyer-trust network** — Privacy-preserving shared default signals across SMBs without exposing raw data. · _owner_ · data moat / federation
135. **Self-evolving invoice templates** — Templates redesign themselves based on what maximizes paid-on-time across the network. · _finance_ · network-learning
136. **Intent-based revenue goals** — Owner states "₹50L collected by quarter-end"; the agent swarm plans and executes to hit it. · _owner_ · 2090 intent computing
137. **Autonomous revenue treasury** — Collected funds auto-sweep into yield, payroll buffer, or debt paydown per policy. · _finance_ · embedded treasury
138. **Self-issuing usage oracle** — IoT/usage oracles trigger metered invoices the instant a consumption threshold is crossed. · _ops_ · IoT/event-driven money
139. **Regulation-aware autopilot** — Billing agent ingests new GST/tax circulars and updates invoicing rules before they take effect. · _CA_ · zero-touch compliance
140. **Self-driving order-to-cash** — Fully autonomous loop: sense demand, quote, deliver, invoice, settle, reconcile, book — human-optional. · _owner_ · 2090 self-driving O2C
