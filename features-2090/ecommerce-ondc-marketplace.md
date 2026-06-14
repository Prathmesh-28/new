# E-commerce, ONDC & Marketplace Finance (140 features)
> India-first finance rails that turn every marketplace, ONDC node and D2C storefront into a reconciled, financed, self-optimizing ledger.

1. **Amazon settlement importer** — Pulls Amazon Seller settlement reports and maps each line to orders, fees and refunds · _finance_ · SMB pain: opaque marketplace payouts
2. **Flipkart payout reconciler** — Matches Flipkart Seller Hub settlements against expected order values, flags shortfalls automatically · _finance_ · SMB pain: payout mismatches
3. **Meesso reseller ledger** — Tracks Meesho margins, supplier payouts and reseller commissions in one ledger view · _finance_ · competitor gap: no Meesho-native books
4. **Multi-channel sales consolidator** — Unifies Amazon, Flipkart, Meesho, ONDC and D2C orders into one revenue timeline · _owner_ · SMB pain: fragmented channels
5. **Commission/fee tracker** — Itemizes referral, closing, weight-handling and shipping fees per SKU per marketplace · _finance_ · SMB pain: hidden platform fees
6. **TCS u/s 52 auto-credit** — Captures marketplace-collected 1% TCS, reconciles to GSTR-2B and claims it as cash ledger credit · _CA_ · SMB pain: lost TCS credits
7. **GSTR-8 cross-check** — Verifies operator-filed GSTR-8 against your sales, flags under-reported TCS · _CA_ · competitor gap: no GSTR-8 tooling
8. **ONDC seller onboarding wizard** — Guides catalog, GST, FSSAI and bank linking to go live as an ONDC seller node · _owner_ · future trend: ONDC adoption
9. **ONDC order-to-ledger sync** — Streams ONDC network orders into books with buyer-app and seller-app attribution · _finance_ · future trend: ONDC commerce
10. **Listing-to-ledger mapper** — Links each marketplace listing/ASIN to an internal SKU and GL account automatically · _ops_ · SMB pain: SKU sprawl
11. **Returns/RTO finance tracker** — Records return, RTO and reverse-logistics costs against original sale margin · _finance_ · SMB pain: return leakage
12. **Refund reconciliation engine** — Matches customer refunds to marketplace debit notes and adjusts revenue and GST · _finance_ · SMB pain: refund mismatches
13. **Payment-cycle financing offer** — Advances cash against confirmed but unsettled marketplace receivables at next-payout maturity · _owner_ · credit gap: locked receivables
14. **Omnichannel inventory valuation** — Values stock across FBA, self-ship, dark stores and warehouses at landed cost · _finance_ · SMB pain: scattered stock value
15. **D2C storefront revenue capture** — Ingests Shopify/WooCommerce orders, taxes and gateway fees into the ledger · _finance_ · competitor gap: D2C-blind books
16. **Quick-commerce settlement sync** — Reconciles Blinkit, Zepto and Instamart payouts, slotting fees and dark-store charges · _finance_ · future trend: q-commerce
17. **Per-SKU profitability dashboard** — Shows net margin per SKU after fees, ads, returns, storage and shipping · _owner_ · SMB pain: blind SKU economics
18. **Marketplace ad-spend allocator** — Attributes Amazon/Flipkart PPC spend to SKUs and into COGS for true margin · _finance_ · SMB pain: ad cost blindness
19. **Settlement shortfall alerts** — Notifies when actual payout deviates from expected beyond a tolerance threshold · _finance_ · SMB pain: silent deductions
20. **GST e-invoice for marketplace sales** — Auto-generates IRN-backed e-invoices for B2B marketplace orders above threshold · _CA_ · SMB pain: e-invoice burden
21. **Place-of-supply auto-resolver** — Determines IGST vs CGST/SGST per order from buyer ship-to state · _CA_ · SMB pain: wrong tax heads
22. **FBA fee audit** — Detects overcharged FBA storage, long-term and removal fees eligible for reimbursement · _finance_ · competitor gap: no fee-audit tooling
23. **Lost/damaged inventory claims** — Flags FBA lost/damaged units and drafts reimbursement claims with evidence · _ops_ · SMB pain: unclaimed losses
24. **Cross-marketplace price monitor** — Tracks your price vs competitors across platforms and margin impact of changes · _sales_ · SMB pain: price wars
25. **Channel-level P&L** — Generates standalone profit and loss for each sales channel monthly · _owner_ · SMB pain: no channel clarity
26. **Coupon and discount ledger** — Records seller-funded vs platform-funded discounts separately for accurate net revenue · _finance_ · SMB pain: discount leakage
27. **Reserve-balance visibility** — Surfaces marketplace-held reserve amounts and projected release dates · _finance_ · SMB pain: trapped reserves
28. **Marketplace loan reconciler** — Tracks Amazon Lending/Flipkart capital repayments deducted from settlements · _finance_ · SMB pain: opaque repayments
29. **SKU velocity vs cash report** — Correlates sell-through speed with cash-conversion cycle per product · _owner_ · SMB pain: slow-mover cash drag
30. **Multi-warehouse GST registration tracker** — Maps inventory locations to required state GST registrations · _CA_ · SMB pain: multi-state compliance
31. **Stock-transfer e-way bill generator** — Auto-creates e-way bills for inter-warehouse and FBA inbound shipments · _ops_ · SMB pain: e-way bill manual work
32. **Return-rate margin simulator** — Models how return-rate changes shift net SKU profitability · _owner_ · SMB pain: returns hurt margin
33. **Payout calendar** — Forecasts all marketplace payout dates and amounts on a unified cash calendar · _finance_ · SMB pain: unpredictable cash
34. **Gateway fee normalizer** — Reconciles Razorpay/PayU/Cashfree fees per D2C transaction into expense ledger · _finance_ · SMB pain: gateway fee sprawl
35. **COD remittance tracker** — Tracks cash-on-delivery collections held and remitted by logistics partners · _finance_ · SMB pain: COD float
36. **Shipping aggregator reconciliation** — Matches Shiprocket/Delhivery charges, COD and weight disputes to orders · _ops_ · SMB pain: shipping disputes
37. **Weight-discrepancy disputer** — Detects courier weight overcharges and auto-files disputes · _ops_ · competitor gap: no weight-dispute automation
38. **ONDC dynamic-pricing publisher** — Pushes margin-safe prices to ONDC catalog with floor-price guardrails · _sales_ · future trend: ONDC pricing
39. **Multi-buyer-app attribution** — Splits ONDC revenue by buyer app (Paytm, PhonePe, etc.) for channel analysis · _finance_ · future trend: ONDC fragmentation
40. **Listing health-to-revenue link** — Connects suppressed/inactive listings to lost revenue estimates · _sales_ · SMB pain: dead listings
41. **Restock financing trigger** — Offers working capital when reorder point is hit for fast-moving SKUs · _owner_ · credit gap: stockout cash crunch
42. **Seasonal demand cash planner** — Projects festive (Diwali/BBD/GIF) cash needs and pre-arranges credit · _owner_ · SMB pain: seasonal swings
43. **Marketplace chargeback ledger** — Records A-to-z claims and chargebacks against revenue with dispute status · _finance_ · SMB pain: chargeback losses
44. **Net-realization per order** — Computes final cash realized per order after all deductions in one view · _finance_ · SMB pain: gross-vs-net gap
45. **GST on platform fees ITC** — Claims input credit on marketplace commission GST against output liability · _CA_ · SMB pain: missed ITC
46. **Bundle/combo COGS splitter** — Allocates cost across components of bundled listings for accurate margin · _finance_ · SMB pain: combo costing
47. **Inventory aging by channel** — Highlights slow-moving stock per warehouse/marketplace for liquidation · _ops_ · SMB pain: dead stock
48. **Liquidation pricing optimizer** — Recommends markdown levels to clear aging stock while protecting cash · _sales_ · SMB pain: capital tied in stock
49. **Marketplace tax-report exporter** — Generates GSTR-1/3B-ready exports segmented by operator and TCS · _CA_ · SMB pain: filing prep
50. **Cross-border marketplace handler** — Reconciles Amazon Global, Etsy and export payouts with FIRC and LUT tracking · _CA_ · future trend: export commerce
51. **Quick-commerce slotting-fee analyzer** — Breaks down dark-store placement and visibility fees by SKU ROI · _finance_ · future trend: q-commerce economics
52. **Hyperlocal delivery-cost allocator** — Distributes last-mile q-commerce delivery cost into order margin · _finance_ · future trend: hyperlocal
53. **Influencer/affiliate payout ledger** — Tracks D2C affiliate commissions and TDS u/s 194H · _finance_ · SMB pain: affiliate accounting
54. **Subscription D2C revenue recognizer** — Spreads recurring D2C subscription revenue across the period earned · _CA_ · SMB pain: subscription accrual
55. **Marketplace dispute war-room** — Centralizes all open fee, refund and reimbursement disputes with deadlines · _ops_ · SMB pain: scattered disputes
56. **SKU-level break-even calculator** — Computes minimum price to break even per SKU across each channel · _owner_ · SMB pain: pricing below cost
57. **Ad ROAS-to-margin guardrail** — Pauses ad campaigns when blended margin after ACoS turns negative · _sales_ · SMB pain: unprofitable ads
58. **Returnless-refund cost tracker** — Quantifies cost of marketplace returnless refunds on margin · _finance_ · SMB pain: refund abuse
59. **Multi-GSTIN consolidation** — Rolls up books across multiple state GSTINs into one group view · _CA_ · SMB pain: multi-GSTIN sprawl
60. **Marketplace KYC/document vault** — Stores and renews seller registration, GST, bank and brand docs per platform · _ops_ · SMB pain: account suspensions
61. **Buyer-payment-failure recovery** — Flags failed D2C payments and triggers retry/recovery nudges · _sales_ · SMB pain: abandoned payments
62. **Holding-period interest calculator** — Estimates cost of capital locked between sale and payout per channel · _finance_ · SMB pain: cash-cycle cost
63. **Festival-sale event reconciler** — Reconciles Big Billion Days/Great Indian Festival event payouts and event fees · _finance_ · SMB pain: event chaos
64. **Brand-store revenue split** — Separates Amazon Brand Store and storefront-driven sales for attribution · _sales_ · SMB pain: attribution gaps
65. **Negative-balance recovery tracker** — Tracks marketplace negative balances and recovery from future payouts · _finance_ · SMB pain: clawbacks
66. **SKU-mix margin optimizer** — Recommends shifting volume toward higher-net-margin SKUs and channels · _owner_ · SMB pain: low-margin focus
67. **Pre-paid vs COD profitability** — Compares net margin of prepaid vs COD orders including RTO risk · _finance_ · SMB pain: COD losses
68. **ONDC logistics-fee reconciler** — Matches ONDC unbundled logistics provider charges to orders · _ops_ · future trend: ONDC unbundling
69. **Marketplace contract-term tracker** — Surfaces fee-schedule and commission changes per platform agreement · _owner_ · SMB pain: silent fee hikes
70. **Multi-currency D2C settler** — Books international D2C sales at transaction-date FX with realized gain/loss · _CA_ · future trend: global D2C
71. **GST credit-note auto-issuer** — Issues GST credit notes for returns and adjusts output tax automatically · _CA_ · SMB pain: manual credit notes
72. **Inventory-financed reorder** — Embeds invoice-discounted credit to fund POs at the moment of reorder · _owner_ · credit gap: PO funding
73. **Channel cannibalization detector** — Flags when discounting on one channel erodes margin on another · _sales_ · SMB pain: self-competition
74. **Settlement-line anomaly detector** — Uses ML to spot abnormal fee lines in settlement files · _finance_ · competitor gap: manual audits
75. **Per-order unit-economics card** — One-tap view of revenue, COGS, fees, shipping and net per order · _owner_ · SMB pain: order opacity
76. **Marketplace working-capital score** — Scores creditworthiness from settlement history for embedded lending · _finance_ · credit gap: thin files
77. **Returns-prediction model** — Predicts return likelihood per SKU/region to pre-provision for it · _ops_ · SMB pain: surprise returns
78. **Dark-store inventory financier** — Funds stock placed in q-commerce dark stores against sell-through data · _owner_ · future trend: q-commerce capital
79. **Cross-channel stock allocator** — Recommends inventory split across channels to maximize margin and minimize stockouts · _ops_ · SMB pain: misallocated stock
80. **Marketplace fee-benchmark report** — Compares your effective fee load against category peers · _owner_ · competitor gap: no benchmarks
81. **GSTR-2B vs commission-invoice matcher** — Reconciles operator commission invoices to GSTR-2B for ITC · _CA_ · SMB pain: ITC mismatch
82. **D2C gateway settlement T+ tracker** — Tracks gateway T+1/T+2 settlement timing and reserves · _finance_ · SMB pain: settlement delay
83. **Listing-suspension financial alert** — Estimates daily revenue loss while a listing/account is suspended · _owner_ · SMB pain: suspension cost
84. **Marketplace loyalty/cashback ledger** — Accounts for SuperCoins/cashback funded by seller vs platform · _finance_ · SMB pain: loyalty costing
85. **Auto-GST-rate by HSN** — Applies correct GST rate per HSN to every marketplace listing · _CA_ · SMB pain: wrong rates
86. **Reverse-logistics SLA cost** — Tracks return-pickup SLA breaches and their cost recovery · _ops_ · SMB pain: reverse-logistics cost
87. **Channel-add ROI simulator** — Models profit impact before launching on a new marketplace · _owner_ · SMB pain: blind expansion
88. **Marketplace cash-flow forecast** — Projects 90-day cash from confirmed orders, payouts and reserves · _finance_ · SMB pain: cash forecasting
89. **Per-pincode profitability heatmap** — Maps net margin by delivery pincode factoring shipping and RTO · _sales_ · SMB pain: unprofitable zones
90. **Embedded insurance on shipments** — Offers per-order transit insurance funded from margin at checkout · _ops_ · embedded finance trend
91. **Marketplace receivables factoring** — Sells confirmed marketplace receivables to financiers at click of a button · _owner_ · credit gap: liquidity
92. **Listing-creation cost capitalizer** — Tracks photography, content and onboarding costs per SKU launch · _finance_ · SMB pain: launch cost blindness
93. **Composite-scheme eligibility checker** — Flags whether marketplace sales breach composition-scheme limits · _CA_ · SMB pain: scheme breaches
94. **Multi-channel inventory reservation** — Holds and releases stock across channels to prevent oversell · _ops_ · SMB pain: oversell penalties
95. **Settlement-to-bank matcher** — Reconciles marketplace settlement reports to actual bank credits · _finance_ · SMB pain: bank mismatch
96. **Autonomous settlement-reconciliation agent** — AI agent fully reconciles every marketplace payout nightly with zero human review · _finance_ · future trend: agentic finance
97. **ONDC-native programmable settlement** — Smart-contract auto-splits ONDC payment among seller, logistics and financier on delivery · _finance_ · future trend: programmable money
98. **Autonomous repricing-for-margin agent** — AI continuously reprices every SKU across channels to a target net margin · _sales_ · future trend: self-optimizing pricing
99. **Agent-to-agent marketplace procurement** — Your buying agent negotiates restock terms with suppliers' selling agents autonomously · _owner_ · future trend: agent-to-agent commerce
100. **Predictive returns-reserve agent** — Auto-provisions a cash reserve sized to forecast returns per channel daily · _finance_ · future trend: predictive finance
101. **Self-financing inventory loop** — System auto-draws and repays working capital as stock sells, with no manual trigger · _owner_ · future trend: ambient finance
102. **Digital twin of the seller business** — Simulates channel/pricing/inventory changes on a live virtual replica before acting · _owner_ · future trend: digital twin
103. **CBDC programmable seller payout** — Receives marketplace payouts in e-rupee with conditional release on delivery confirmation · _finance_ · future trend: CBDC
104. **Tokenized inventory financing** — Issues on-chain tokens representing warehouse stock as collateral for instant credit · _owner_ · future trend: tokenization
105. **Zero-touch GST filing for commerce** — Files GSTR-1/3B/8-reconciled returns autonomously from marketplace data · _CA_ · future trend: zero-touch compliance
106. **Quantum demand-and-cash optimizer** — Quantum-models demand, pricing and cash across all channels simultaneously · _owner_ · future trend: quantum optimization
107. **Ambient settlement reconciliation** — Reconciliation runs invisibly in background; surfaces only exceptions to humans · _finance_ · future trend: invisible finance
108. **Agentic dispute filing** — AI auto-detects, drafts and files fee/reimbursement disputes end-to-end · _ops_ · future trend: agentic ops
109. **Neural-interface seller cockpit** — Owner queries channel P&L and cash via thought/voice in an AR cockpit · _owner_ · future trend: neural interface
110. **Self-driving multi-channel books** — Ledger posts, classifies and closes commerce transactions with no bookkeeper · _CA_ · future trend: self-driving books
111. **Real-time net-margin meter** — Live blended net margin across all channels updates per second · _owner_ · future trend: real-time everything
112. **Predictive stockout-financing agent** — Forecasts stockouts and pre-funds restock before the shelf empties · _owner_ · credit gap + predictive
113. **Autonomous channel-mix rebalancer** — AI shifts inventory and ad budget across channels to maximize group margin · _sales_ · future trend: autonomous optimization
114. **Smart-contract escrow for D2C** — Holds D2C buyer funds in programmable escrow, releasing on delivery proof · _customer_ · future trend: smart-contract escrow
115. **AI returns-fraud sentinel** — Detects serial-return and wardrobing fraud patterns across channels and blocks abusers · _ops_ · future trend: AI fraud
116. **Agent-negotiated marketplace fees** — Your finance agent negotiates commission/ad rates with platform agents · _owner_ · future trend: agent-to-agent
117. **Carbon-cost per order ledger** — Tracks and offsets shipping/packaging carbon per order into ESG books · _CA_ · future trend: ESG accounting
118. **DPDP-compliant buyer-data vault** — Stores buyer PII with consent ledger for marketing and refunds · _ops_ · future trend: data sovereignty
119. **OCEN cash-flow lending for sellers** — Underwrites loans on marketplace cash-flow data via OCEN rails instantly · _owner_ · India DPI: OCEN
120. **Account Aggregator commerce underwriting** — Pulls AA-consented bank+GST data to price seller credit in seconds · _finance_ · India DPI: AA
121. **UPI credit-line at checkout** — Funds D2C buyer purchases via UPI credit line, settling seller instantly · _customer_ · India DPI: UPI credit
122. **Autonomous ONDC node operator** — AI runs your ONDC seller node: catalog, pricing, fulfillment, settlement end-to-end · _owner_ · future trend: ONDC autonomy
123. **Predictive payout-shortfall guard** — Forecasts settlement shortfalls before they happen and pre-files claims · _finance_ · future trend: predictive
124. **Self-optimizing bundle designer** — AI composes product bundles that maximize margin and clear aging stock · _sales_ · future trend: self-optimization
125. **Ambient inventory-finance settlement** — Programmable money auto-repays inventory loans as each unit sells in real time · _finance_ · future trend: programmable + ambient
126. **Cross-marketplace identity graph** — Links the same product/buyer/SKU across all platforms into one entity graph · _ops_ · competitor gap: no unified graph
127. **Agentic festive-season planner** — AI pre-positions stock, credit and ad budget for festive demand autonomously · _owner_ · SMB pain + agentic
128. **Programmable seller-payout splitter** — Auto-routes each payout to GST escrow, loan repayment and owner draw by rule · _finance_ · future trend: programmable money
129. **Real-time TCS/TDS ledger** — Captures TCS u/s 52 and TDS on commission in real time as orders settle · _CA_ · India: TCS/TDS
130. **AI marketplace-policy interpreter** — Reads platform policy changes and auto-adjusts your finance/compliance flows · _ops_ · future trend: agentic compliance
131. **Self-healing reconciliation** — System detects and auto-corrects mismatched settlement entries without human input · _finance_ · future trend: self-healing
132. **Predictive working-capital twin** — Digital twin forecasts cash gaps and pre-arranges financing across channels · _owner_ · future trend: digital twin
133. **Agent-to-agent returns settlement** — Buyer, seller and logistics agents negotiate and settle return costs autonomously · _ops_ · future trend: agent-to-agent
134. **Spatial omnichannel inventory map** — AR/spatial view of stock, value and cash across every warehouse and dark store · _ops_ · future trend: spatial interface
135. **Autonomous cross-border commerce desk** — AI handles export pricing, FX, FIRC, LUT and GIFT-City settlement for global sales · _CA_ · future trend: cross-border autonomy
136. **Self-pricing q-commerce engine** — Prices SKUs per dark store by real-time local demand to hit margin targets · _sales_ · future trend: hyperlocal AI pricing
137. **Programmable refund escrow** — Refunds release from smart-contract escrow only on verified return receipt · _customer_ · future trend: smart-contract escrow
138. **Predictive marketplace-fee forecaster** — Forecasts next quarter's blended fee load and its margin impact per channel · _finance_ · future trend: predictive finance
139. **Zero-touch multi-channel close** — Books close monthly across all channels autonomously with audit-ready trail · _CA_ · future trend: zero-touch + self-driving
140. **Sentient seller-finance co-pilot** — Ambient AI CFO that runs pricing, financing, compliance and reconciliation for the whole commerce operation · _owner_ · future trend: AI-CFO agent
