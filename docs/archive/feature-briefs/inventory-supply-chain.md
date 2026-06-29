# Inventory & Supply-Chain Finance (140 features)
> Turn every SKU, batch, and warehouse into a financed, traceable, self-replenishing asset that funds the business it sits inside.

1. **Real-time stock ledger** — Perpetual quantity-and-value ledger updated on every sale, purchase, and adjustment in milliseconds · _ops_ · SMB pain: Vyapar stock counts drift from reality
2. **FIFO valuation engine** — Auto-layer cost lots so COGS and closing stock follow first-in-first-out exactly · _finance_ · competitor gap: Vyapar lacks audited FIFO layers
3. **Weighted-average costing** — Continuous moving-average cost recomputed per receipt for blended-cost businesses · _finance_ · SMB pain: manual WA math errors
4. **Standard-cost with variance** — Set standard costs, auto-post purchase-price and usage variances to P&L · _CA_ · competitor gap: Tally needs heavy config
5. **Batch/lot tracking** — Assign and trace lot numbers from receipt through sale with full quantity history · _ops_ · SMB pain: pharma/food recalls untraceable
6. **Expiry-date management** — Track shelf life per batch, auto-flag near-expiry stock for clearance · _ops_ · SMB pain: dead pharma/FMCG stock written off
7. **Serial-number tracking** — Per-unit serial capture for electronics, warranties, and theft recovery · _sales_ · SMB pain: warranty disputes unresolvable
8. **Multi-warehouse ledgers** — Independent stock and valuation per location with consolidated rollup · _ops_ · competitor gap: Vyapar single-godown only
9. **Inter-warehouse transfers** — One-tap stock movement with in-transit tracking and auto journal entries · _ops_ · SMB pain: transfers lost between godowns
10. **Reorder-point alerts** — Per-SKU min/max levels trigger restock alerts before stockouts · _ops_ · SMB pain: surprise stockouts lose sales
11. **Bill of materials (BOM)** — Define multi-level component recipes for manufactured finished goods · _ops_ · competitor gap: weak BOM in mobile apps
12. **Production order costing** — Roll component, labour, and overhead costs into finished-good unit cost · _finance_ · SMB pain: manufacturers guess product cost
13. **Landed-cost allocation** — Distribute freight, duty, and insurance across received items by value or weight · _finance_ · SMB pain: import cost understated
14. **Barcode scan in/out** — Scan-to-receive and scan-to-bill using any phone camera · _sales_ · SMB pain: manual entry slow at counter
15. **QR-coded SKUs** — Generate printable QR labels encoding SKU, batch, and price · _ops_ · future trend: phone-native scanning
16. **GST job-work register** — Track goods sent to job-workers with ITC-04 quarterly return auto-prep · _CA_ · India: ITC-04 filing manual today
17. **E-way bill auto-generation** — Create e-way bills from transfer/sales docs above threshold automatically · _ops_ · India: e-way bill compliance friction
18. **Dead-stock detector** — Flag SKUs with no movement over a set window and value tied up · _owner_ · SMB pain: cash trapped in slow stock
19. **Stock-aging report** — Bucket inventory by days-held to spot obsolescence early · _finance_ · SMB pain: aging invisible until audit
20. **Cycle-count scheduler** — Plan rolling counts by ABC class instead of full annual shutdown · _ops_ · SMB pain: annual count halts business
21. **Physical-count reconciliation** — Scan-count then auto-post shrinkage/gain adjustments with variance report · _ops_ · SMB pain: count vs book mismatch
22. **ABC analysis** — Classify SKUs by revenue contribution to focus controls on vital few · _finance_ · SMB pain: all stock treated equally
23. **Multi-unit conversions** — Buy in cartons, store in boxes, sell in pieces with auto conversion · _ops_ · competitor gap: rigid UoM elsewhere
24. **Batch-wise GST rates** — Apply differing HSN/GST rates per batch where regulation differs · _CA_ · India: HSN-rate edge cases
25. **Negative-stock guardrails** — Block or warn on sales that would drive stock below zero · _ops_ · SMB pain: overselling phantom stock
26. **Min-margin price floor** — Prevent billing below cost-plus-margin using live landed cost · _sales_ · SMB pain: discounting below cost
27. **Demand-forecast baseline** — Seasonal time-series forecast of unit demand per SKU · _ops_ · SMB pain: ordering by gut feel
28. **Economic order quantity** — Compute cost-optimal order size from demand, holding, and order costs · _finance_ · SMB pain: over/under-ordering
29. **Safety-stock calculator** — Set buffer stock from lead-time variability and service-level target · _ops_ · SMB pain: stockouts during lead time
30. **Supplier lead-time tracking** — Learn each vendor's actual delivery time to tune reorder timing · _ops_ · SMB pain: late deliveries unplanned
31. **Purchase-order workflow** — Raise, approve, and email POs that auto-match on goods receipt · _finance_ · SMB pain: PO-less buying chaos
32. **Three-way match** — Auto-reconcile PO, goods receipt note, and vendor invoice before payment · _finance_ · SMB pain: paying wrong invoices
33. **Goods-receipt note (GRN)** — Record partial/full receipts against PO with quality-hold status · _ops_ · SMB pain: receipts untracked
34. **Damaged-goods quarantine** — Segregate rejected stock into a non-sellable bin with reason codes · _ops_ · SMB pain: damaged stock resold
35. **Stock-valuation reports** — Closing-stock value by method, location, and category for audit · _CA_ · SMB pain: year-end valuation scramble
36. **Inventory-to-balance-sheet link** — Stock value flows live into balance sheet and P&L COGS · _CA_ · competitor gap: disconnected modules
37. **Consignment-stock tracking** — Track goods held at customer/dealer sites not yet sold · _sales_ · SMB pain: consignment untracked
38. **Bin/rack location mapping** — Assign shelf locations to speed picking and counts · _ops_ · SMB pain: hunting for stock
39. **Pick-pack-ship lists** — Generate optimized pick lists grouped by location for order fulfilment · _ops_ · SMB pain: slow order picking
40. **Returns & RMA handling** — Process customer returns back to sellable/quarantine with credit notes · _customer_ · SMB pain: returns mishandled
41. **Vendor return debit notes** — Send defective stock back to suppliers with auto debit note and ITC reversal · _CA_ · India: ITC reversal on returns
42. **Multi-currency purchase costing** — Record import POs in foreign currency, value at landed INR · _finance_ · SMB pain: FX cost confusion
43. **Customs-duty & IGST capture** — Capture BoE duty and IGST as ITC-eligible landed-cost components · _CA_ · India: import ITC tracking
44. **Stock-transfer e-invoice** — Issue delivery challans and e-invoices for stock transfers across GSTINs · _CA_ · India: branch-transfer invoicing
45. **Batch-recall workflow** — Trace a defective batch to every customer and auto-notify for recall · _customer_ · SMB pain: recall blind spots
46. **Perishable markdown engine** — Auto-suggest discount ladders as expiry nears to clear stock profitably · _sales_ · SMB pain: throwing away expired stock
47. **Kitting & assembly** — Bundle SKUs into sellable kits with auto component depletion · _sales_ · SMB pain: combo-pack inventory drift
48. **De-kitting / breakdown** — Disassemble kits back into components when sold separately · _ops_ · competitor gap: rare in SMB tools
49. **Wastage & scrap accounting** — Record manufacturing scrap and yield loss against production orders · _finance_ · SMB pain: scrap untracked in cost
50. **By-product valuation** — Allocate joint costs to main and by-products at split-off · _CA_ · competitor gap: niche costing missing
51. **Stock-turn dashboard** — Live inventory-turnover and days-of-inventory KPIs by category · _owner_ · SMB pain: no turnover visibility
52. **Carrying-cost calculator** — Quantify true holding cost (capital, storage, obsolescence) per SKU · _finance_ · SMB pain: hidden holding cost
53. **Stockout-cost estimator** — Estimate lost sales and goodwill from each stockout event · _owner_ · SMB pain: stockout cost invisible
54. **Promotion demand-lift modeling** — Predict inventory needed for a planned promo or festival surge · _sales_ · SMB pain: festival under-stocking
55. **Seasonal pre-buy planner** — Recommend pre-season bulk buys balancing discount vs holding cost · _finance_ · SMB pain: seasonal cash crunch
56. **Vendor price-history tracker** — Track per-vendor price trends to time and negotiate purchases · _finance_ · SMB pain: paying rising prices blind
57. **Best-vendor recommender** — Rank suppliers by price, lead time, quality, and reliability score · _ops_ · SMB pain: vendor choice by habit
58. **Drop-ship orchestration** — Route customer orders straight to supplier with margin and tracking · _sales_ · future trend: asset-light retail
59. **Stock-as-collateral valuation** — Value pledged inventory for inventory-financing applications · _owner_ · India: ₹25T MSME credit gap
60. **Anchor-led supplier financing** — Finance suppliers off a large buyer's confirmed POs and creditworthiness · _finance_ · future trend: anchor supply-chain finance
61. **Distributor channel financing** — Extend credit lines to dealers against sell-through inventory data · _finance_ · India: OCEN channel finance
62. **Purchase-order financing** — Fund procurement against confirmed POs before goods are received · _owner_ · SMB pain: can't fund big orders
63. **Inventory-backed working capital** — Revolving line sized live to current sellable stock value · _owner_ · India: collateral-light lending
64. **Warehouse-receipt financing** — Borrow against goods in registered warehouses via e-receipts · _finance_ · India: WDRA e-NWR lending
65. **GST-data lending signal** — Share GSTR purchase/sale velocity as underwriting input via AA consent · _CA_ · India: OCEN cash-flow lending
66. **Sell-through-rate underwriting** — Lenders price credit using real-time inventory sell-through, not balance sheet · _finance_ · future trend: data-driven credit
67. **Dynamic discounting** — Offer suppliers early payment for a discount funded by surplus cash · _finance_ · competitor gap: Cashflo-style for SMB
68. **Reverse factoring marketplace** — Suppliers sell approved invoices to lenders at buyer's low rate · _finance_ · India: KredX/CredAble for SMB
69. **Embedded inventory insurance** — Quote and bind stock/transit insurance from within the ledger · _owner_ · future trend: embedded finance
70. **Spoilage insurance triggers** — Parametric payout when cold-chain breach spoils insured perishable stock · _customer_ · future trend: parametric insurance
71. **Landed-cost what-if** — Simulate margin impact of duty, freight, or FX changes before importing · _finance_ · SMB pain: import margin surprises
72. **Reorder auto-PO drafts** — Auto-draft purchase orders at reorder point for one-tap approval · _ops_ · SMB pain: forgot to reorder
73. **Multi-location demand balancing** — Rebalance stock between warehouses to match local demand · _ops_ · competitor gap: no network optimization
74. **Shelf-life-aware FEFO picking** — Pick first-expiry-first-out automatically to minimize spoilage · _ops_ · SMB pain: old stock left behind
75. **Traceability passport** — Per-batch origin-to-shelf provenance record for compliance and trust · _customer_ · future trend: supply-chain transparency
76. **Counterfeit-detect QR** — Tamper-evident serialized QR lets customers verify authenticity · _customer_ · India: counterfeit goods problem
77. **Supplier ESG scorecard** — Score vendors on carbon, labour, and sourcing ethics for procurement · _owner_ · future trend: ESG sourcing
78. **Carbon-per-SKU accounting** — Attribute embodied and transport carbon to each unit of stock · _CA_ · future trend: ESG/carbon accounting
79. **Cold-chain IoT logging** — Ingest temperature/humidity sensor logs against batches for quality proof · _ops_ · future trend: IoT supply chain
80. **RFID bulk receiving** — Read entire pallets via RFID in one pass for instant receipt posting · _ops_ · future trend: RFID at SMB scale
81. **Vision-based shelf counting** — Camera/CV counts shelf stock from a photo to verify book quantity · _ops_ · future trend: computer-vision inventory
82. **Voice stock queries** — Ask "how much SKU-12 left in Pune?" by voice in Hindi/regional language · _owner_ · India: vernacular voice UX
83. **WhatsApp reorder approvals** — Approve auto-drafted POs and view low-stock alerts inside WhatsApp · _owner_ · India: 80% on WhatsApp
84. **Predictive obsolescence scoring** — ML flags SKUs likely to go dead 90 days before they do · _finance_ · SMB pain: late obsolescence write-offs
85. **Demand-sensing from POS signals** — Adjust forecasts hourly from live point-of-sale velocity · _sales_ · future trend: real-time demand sensing
86. **Weather-linked demand model** — Adjust stock forecasts using local weather and festival calendars · _ops_ · India: monsoon/festival demand swings
87. **Substitution recommender** — Suggest in-stock alternatives when a requested SKU is out · _sales_ · SMB pain: lost sale on stockout
88. **Multi-echelon optimization** — Optimize stock across supplier-warehouse-store tiers jointly · _ops_ · competitor gap: enterprise-only feature
89. **Returns-prediction model** — Predict return rates per SKU/customer to plan reverse logistics · _customer_ · SMB pain: surprise return floods
90. **Theft/shrinkage anomaly AI** — Detect unusual depletion patterns signaling pilferage · _owner_ · SMB pain: silent inventory shrinkage
91. **Auto-landed-cost from shipping docs** — OCR bills of lading and invoices to auto-allocate landed cost · _finance_ · SMB pain: manual landed-cost entry
92. **Digital twin of inventory** — Live simulated replica of all stock, flows, and finance to test decisions · _owner_ · future trend: business digital twin
93. **Scenario stress-testing** — Simulate supplier failure or demand spike on the twin before it happens · _owner_ · future trend: predictive resilience
94. **Cash-tied-up heatmap** — Visualize exactly how much cash each shelf, SKU, and batch immobilizes · _finance_ · SMB pain: "profitable but no cash"
95. **Just-in-time credit at reorder** — Working-capital draw auto-offered exactly when a PO is raised · _owner_ · future trend: just-in-time capital
96. **Inventory-tokenization ledger** — Represent each lot as a programmable token for fractional financing · _finance_ · future trend: tokenized assets
97. **Smart-contract escrow on delivery** — Release supplier payment automatically when IoT confirms delivery · _finance_ · future trend: programmable money
98. **CBDC programmable purchase money** — Pay suppliers in e-rupee earmarked to spend only on approved goods · _finance_ · India: CBDC programmability
99. **AA-consented supply-chain graph** — Build a consented financial map of suppliers and buyers for credit · _CA_ · India: Account Aggregator + DEPA
100. **ONDC stock publishing** — Publish live sellable inventory to ONDC buyer network automatically · _sales_ · India: ONDC commerce rails
101. **Agent-to-agent procurement** — Your buying agent negotiates price and terms with supplier agents · _ops_ · future trend: agentic commerce
102. **Autonomous reorder execution** — Approved policy lets the agent place and pay POs with zero human touch · _ops_ · future trend: agentic AI ~80% txns
103. **Self-tuning safety stock** — Buffers continuously self-adjust as the agent learns demand variance · _ops_ · future trend: self-driving inventory
104. **Self-replenishing shelves** — IoT shelf weight triggers automatic supplier reorder at threshold · _ops_ · future trend: ambient replenishment
105. **Real-time IoT valuation** — Sensors continuously revalue stock as it moves, ages, and degrades · _finance_ · future trend: ambient finance
106. **Continuous closing stock** — Always-accurate live inventory value removes period-end valuation entirely · _CA_ · future trend: self-closing books
107. **Zero-touch GST inventory compliance** — ITC-04, e-way, and stock-transfer filings auto-execute with no human step · _CA_ · India: zero-touch compliance
108. **Ambient dead-stock liquidation** — Agent auto-lists slow stock on marketplaces and accepts best offer · _sales_ · future trend: autonomous liquidation
109. **Predictive spoilage routing** — Agent reroutes near-expiry stock to highest-demand location pre-emptively · _ops_ · future trend: predictive logistics
110. **Negotiation-bot bulk pricing** — Agent aggregates demand across SMBs to negotiate group buying power · _owner_ · future trend: collective bargaining
111. **Dynamic-pricing autopilot** — Prices auto-flex by stock level, expiry, demand, and competitor data · _sales_ · future trend: autonomous pricing
112. **Inventory carbon-budget enforcement** — Agent caps procurement carbon to a set ESG budget per quarter · _owner_ · future trend: carbon-aware ops
113. **Quantum demand-optimization** — Quantum solver optimizes assortment and replenishment across thousands of SKUs · _ops_ · future trend: quantum optimization
114. **Quantum-secure provenance** — Post-quantum-signed batch passports resist tampering and counterfeiting · _customer_ · future trend: quantum-safe security
115. **Neural inventory dashboard** — Glance-based AR/neural overlay shows stock health and cash at risk · _owner_ · future trend: neural/AR interfaces
116. **AR shelf-overlay picking** — AR glasses highlight exact bin, batch, and quantity to pick · _ops_ · future trend: spatial computing
117. **Spatial warehouse twin** — Walk a 3D AR replica of any warehouse from anywhere to inspect stock · _owner_ · future trend: spatial twin
118. **Autonomous landed-cost optimization** — Agent picks the cheapest duty-and-freight import route per shipment · _finance_ · future trend: autonomous trade
119. **Self-financing inventory pool** — Pooled SMB stock backs a shared liquidity fund returning yield on idle goods · _owner_ · future trend: tokenized inventory yield
120. **Fractional inventory investing** — Outside investors fund specific high-turn SKUs for a share of margin · _finance_ · future trend: asset fractionalization
121. **Agent-negotiated reverse factoring** — Finance agent auto-auctions receivables to lowest-rate lender daily · _finance_ · future trend: agentic credit markets
122. **Predictive PO-finance pre-approval** — Credit pre-cleared before you even decide to place the order · _owner_ · future trend: anticipatory finance
123. **Demand-driven smart-contract supply** — Replenishment contracts auto-execute when forecast crosses threshold · _ops_ · future trend: programmable supply
124. **Cross-border GIFT-City sourcing** — Settle import payments via GIFT-City rails with auto compliance · _finance_ · India: GIFT-City cross-border
125. **Ambient theft-deterrent mesh** — Networked RFID/IoT mesh flags and geolocates stock leaving unauthorized · _owner_ · future trend: IoT loss prevention
126. **Self-auditing inventory chain** — Immutable ledger lets CAs and auditors verify stock without site visits · _CA_ · future trend: continuous audit
127. **Autonomous obsolescence write-off** — Agent proposes and books obsolescence provisions with CA sign-off · _CA_ · future trend: self-driving books
128. **Predictive supplier-default shielding** — Agent diversifies sourcing ahead of a supplier's predicted failure · _ops_ · future trend: predictive resilience
129. **Real-time margin-per-shelf-second** — Live profitability of every shelf measured per second of holding · _finance_ · future trend: granular profit sensing
130. **Inventory yield farming** — Idle stock auto-pledged to short-term financing for passive return · _owner_ · future trend: inventory-as-yield
131. **Agentic dropship arbitrage** — Agent spots demand and sources drop-ship supply with zero held stock · _sales_ · future trend: autonomous arbitrage
132. **Holographic stock walkthrough** — Holographic projection of network-wide inventory for instant board review · _owner_ · future trend: holographic interfaces
133. **Bio-sensor freshness grading** — Edible sensors grade actual freshness and revalue perishables in real time · _ops_ · future trend: bio-IoT sensing
134. **Self-negotiating insurance on transit** — Agent binds per-shipment cover at the cheapest live parametric quote · _finance_ · future trend: agentic insurance
135. **Predictive recall containment** — Agent pre-positions replacements and quarantines before a recall is declared · _customer_ · future trend: predictive quality
136. **Carbon-credit minting from waste cuts** — Verified spoilage reductions auto-mint tradable carbon credits · _CA_ · future trend: tokenized carbon
137. **Sovereign-data inventory vault** — Stock and supplier data kept DPDP-compliant with consented agent access only · _owner_ · India: DPDP data sovereignty
138. **Cross-SMB demand-pooling network** — Anonymized demand pooled across peers to forecast and co-buy at scale · _ops_ · future trend: federated forecasting
139. **Fully autonomous supply-chain CFO** — One agent runs procurement, valuation, financing, and compliance end-to-end · _owner_ · future trend: agentic AI-CFO
140. **Self-evolving inventory policy** — System rewrites its own reorder, pricing, and financing rules as markets shift · _owner_ · future trend: self-improving autonomy
