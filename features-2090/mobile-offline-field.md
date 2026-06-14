# Mobile, Offline & Field Finance (140 features)
> Finance that works at the kirana counter, in the delivery van, and on a 2G signal — capturing, settling, and approving money anywhere in Bharat, then syncing the moment a network returns.

1. **Offline-First Ledger** — Full double-entry books usable with zero connectivity; queues entries locally and reconciles on reconnect. · _owner_ · Tally is on-prem-only; cloud rivals break offline
2. **Conflict-Free Sync Engine** — CRDT-based merge so two devices editing the same ledger never lose data on reconnect. · _ops_ · SMB pain: multi-device data clashes
3. **Delta Sync over 2G** — Sends only changed bytes, compressed, so a full day syncs in seconds on EDGE networks. · _ops_ · India 2G/rural bandwidth pain
4. **Optimistic Local Writes** — Invoices and receipts post instantly to the local store; UI never waits on the server. · _sales_ · Cloud-app latency frustration
5. **Resumable Upload Queue** — Interrupted syncs resume from the exact byte; no duplicate or lost transactions. · _ops_ · Patchy rural connectivity
6. **Offline GST Invoice Draft** — Generate compliant GST invoices offline; e-invoice IRN auto-fetched when signal returns. · _finance_ · Competitor gap: e-invoicing needs live connection
7. **Local-First Inventory Counter** — Stock levels decrement on-device at point of sale, syncing across counters later. · _owner_ · Kirana multi-counter stock drift
8. **Camera-First Receipt Capture** — Snap a bill; on-device OCR extracts vendor, amount, GSTIN, date instantly without upload. · _finance_ · Manual data entry burden
9. **Batch Photo Expense Import** — Photograph a stack of bills; edge AI splits and books each as a separate expense. · _finance_ · Bulk receipt backlog pain
10. **Voice-Entry in 12 Languages** — Speak "₹500 to Sharma for milk" in Hindi/Tamil/etc.; books the entry hands-free. · _owner_ · Literacy/typing barrier in Bharat
11. **Mobile POS Billing** — Turn any Android phone into a GST billing counter with thermal-printer pairing. · _sales_ · Vyapar/myBillBook mobile-billing race
12. **Soundbox Payment Confirmation** — Audio announces "₹200 received" in local language so the owner needn't watch the screen. · _owner_ · Counter-staff payment verification
13. **GPS-Stamped Field Transactions** — Every field-collected payment carries verified geo-coordinates and timestamp. · _ops_ · Agent fraud / fake collection claims
14. **Van-Sales Route Ledger** — Pre-loads a route's customer ledgers offline; settles invoices and collections van-side. · _sales_ · FMCG van-sales reconciliation gap
15. **Field Collection Agent App** — Agents view due lists, accept cash/UPI, issue receipts, all offline with end-of-day sync. · _ops_ · Khatabook lacks field-agent workflow
16. **SMS-Fallback Receipt** — When data is down, payment confirmation goes to the customer via plain SMS. · _customer_ · No-smartphone customer reach
17. **USSD Payment Trigger** — Initiate and confirm a collection over *99# USSD where there's no data at all. · _customer_ · Feature-phone segment
18. **On-the-Go Approval Inbox** — Owner approves vendor payments and POs from the phone with one tap; queues if offline. · _owner_ · Approval bottleneck while travelling
19. **Geofenced Petty-Cash Limits** — Field staff cash limits auto-adjust based on the market they're standing in. · _finance_ · Field cash leakage
20. **Quick-Entry Wearable Tap** — Smartwatch logs a cash sale or expense in two taps for hands-busy counters. · _sales_ · Counter speed at peak hours
21. **Offline Khata (Credit Book)** — Digital udhaar ledger per customer works fully offline with running balances. · _owner_ · OkCredit/Khatabook core, but offline-weak
22. **Auto Reminder on Reconnect** — Queued payment reminders to debtors fire via WhatsApp/SMS the instant signal returns. · _finance_ · Late-payment follow-up pain
23. **Edge OCR for Handwritten Bills** — On-device model reads handwritten kirana bills and supplier challans. · _finance_ · Handwritten-doc digitization gap
24. **QR Self-Billing Counter** — Customer scans a counter QR, self-selects items, pays; bill posts to owner's books. · _customer_ · Queue reduction at busy stores
25. **Low-Battery Sync Priority** — Below 15% battery, only critical financial records sync first. · _ops_ · Field device power scarcity
26. **Data-Saver Sync Mode** — Throttles media, syncs ledgers only, to respect ₹-per-MB rural data plans. · _owner_ · Data cost sensitivity
27. **Offline Day-Book Close** — Owner closes the day's cash, reconciles drawer vs sales, all without connectivity. · _owner_ · End-of-day cash tally pain
28. **Field Photo Proof-of-Delivery** — Driver captures geo-stamped delivery photo that auto-releases the invoice for payment. · _ops_ · Delivery-payment dispute gap
29. **Multi-Device Counter Roles** — Cashier, packer, and owner phones share one live offline session with role limits. · _ops_ · Small-team device coordination
30. **Tap-to-Pay Acceptance** — Phone accepts contactless cards/wallets via NFC without a separate POS terminal. · _sales_ · Terminal-cost barrier for micro-merchants
31. **Offline UPI Lite** — On-device wallet settles small UPI payments offline, reconciling with the bank later. · _customer_ · UPI fails without network
32. **Bluetooth Mesh Counter Sync** — Adjacent counters sync sales over Bluetooth when wifi is unavailable. · _ops_ · Multi-till stores without LAN
33. **Hawker/Cart Micro-POS** — Ultra-light billing for street vendors: one-tap items, voice totals, SMS receipts. · _sales_ · Unbanked street-vendor segment
34. **Field Expense Per-Diem Tracker** — Auto-logs travel allowance by GPS distance and time for reimbursing field staff. · _finance_ · Manual reimbursement disputes
35. **Offline GST Rate Lookup** — On-device HSN/SAC tax-rate database so correct tax applies without internet. · _finance_ · Wrong-rate invoicing risk
36. **Reconnect Reconciliation Report** — On sync, a summary shows what posted, what conflicted, what needs review. · _CA_ · Trust gap in offline sync
37. **Geo-Heatmap of Collections** — Owner sees on a map where cash was collected vs still outstanding by area. · _owner_ · Route-coverage blind spots
38. **One-Hand Sale Mode** — Large-button, single-thumb billing UI for crowded counters and moving vans. · _sales_ · Ergonomics on cramped counters
39. **Camera Cheque Capture & Deposit** — Photograph a cheque to record and queue it for deposit with CTS image. · _finance_ · Cheque handling friction
40. **Field Signature Capture** — Customer signs on-screen for credit sales; signature attaches to the offline invoice. · _sales_ · Credit-sale dispute proof
41. **Auto-Retry Failed Payments** — Declined field collections re-attempt across UPI/card/wallet rails automatically. · _ops_ · Single-rail failure loss
42. **Offline Loyalty Points** — Points accrue and redeem at the counter offline, syncing balances later. · _customer_ · Kirana retention tooling gap
43. **Distributor Beat-Plan Settlement** — Reconciles the day's beat (route) sales, returns, and cash against opening stock. · _sales_ · Distributor van settlement pain
44. **Offline Barcode/QR Scan Billing** — Phone camera scans product codes to build a bill with zero connectivity. · _sales_ · Cheap scanning for small shops
45. **Spotty-Network Indicator** — A live badge tells staff whether a sale is "saved locally" or "synced & safe." · _ops_ · Staff anxiety over lost sales
46. **Field Cash-Drop Confirmation** — Agent records cash deposited at a CMS point; matches to bank credit on reconnect. · _finance_ · Cash-in-transit reconciliation
47. **Quick-Capture Voice Memo on Txn** — Attach a spoken note ("damaged goods, gave discount") to any field entry. · _sales_ · Context loss on field deals
48. **Offline Customer 360** — Field rep sees a customer's full ledger, dues, and order history cached on-device. · _sales_ · No customer context in the field
49. **Edge Fraud Flag** — On-device model flags suspicious field collections (odd amounts, off-route GPS) before sync. · _finance_ · Field-collection fraud
50. **Print-Anywhere Pairing** — Auto-pairs with any nearby thermal/Bluetooth printer for instant paper receipts. · _ops_ · Printer setup friction
51. **Offline TDS/TCS Calculation** — Computes withholding on field purchases on-device using cached thresholds. · _finance_ · Compliance errors in the field
52. **Daily SMS Sales Digest** — Owner without a smartphone gets a plain-SMS summary of the day's sales and cash. · _owner_ · Feature-phone owner segment
53. **Field Order-to-Cash Capture** — Take order, confirm stock, bill, and collect in one offline flow per visit. · _sales_ · Fragmented field-sales steps
54. **Geo-Verified Attendance + Beat** — Field staff clock-in is GPS-verified at the customer's location, linked to sales. · _ops_ · Ghost-visit/attendance fraud
55. **Low-Light Camera Capture** — Bill photos in dim shops are auto-enhanced before OCR. · _finance_ · Poor-lighting capture failures
56. **Offline Returns & Credit Notes** — Process sales returns and issue credit notes at the counter without connectivity. · _finance_ · Returns handling gap offline
57. **Pre-Synced Price Lists** — Today's customer-specific prices and schemes cached for offline van billing. · _sales_ · Wrong-price field billing
58. **Battery-Aware Background Sync** — Sync schedules itself for charging windows to spare field-device power. · _ops_ · Device uptime in the field
59. **Tamper-Evident Local Store** — Encrypted, hash-chained local ledger so offline records can't be silently altered. · _CA_ · Audit trust for offline books
60. **Field Photo Aadhaar/PAN Capture** — Capture KYC docs in the field with on-device masking for DPDP compliance. · _finance_ · Field-onboarding compliance
61. **Offline e-Way Bill Draft** — Prepare transport e-way bills offline; auto-generate the number on reconnect. · _ops_ · Goods movement without signal
62. **Auto-Compress & Queue Media** — Receipt photos compress and queue so a 100-bill day uploads on weak data. · _finance_ · Media-heavy sync stalls
63. **Field Discount Approval Chain** — Rep requests an over-limit discount; owner approves from phone or it queues offline. · _sales_ · Margin leakage from field discounts
64. **Single-SIM Dual-Rail Failover** — Switches between mobile data and SMS-relay automatically per transaction. · _ops_ · Rural single-network fragility
65. **Offline Multi-Currency Field Sales** — Border/tourist merchants bill in foreign currency with cached rates. · _sales_ · Border-trade currency gap
66. **Geo-Clustered Route Optimizer** — Suggests the next collection stop by proximity and overdue amount, offline. · _ops_ · Inefficient collection routes
67. **Field Petty-Cash Wallet** — Each agent carries a tracked digital cash float that reconciles to physical cash. · _finance_ · Untracked field floats
68. **Snap-to-Reconcile Bank Slip** — Photograph a deposit slip; OCR matches it to the queued cash drop. · _finance_ · Manual deposit matching
69. **Offline Subscription/Recurring Billing** — Generate recurring counter invoices on schedule even when offline. · _finance_ · Recurring billing needs cloud
70. **Crowd-Counter Queue Mode** — Park multiple open bills simultaneously during rush, settle each independently. · _sales_ · Peak-hour multi-customer billing
71. **Field Stock Audit Camera** — Snap a shelf; vision AI counts facings vs expected to flag shrinkage on-route. · _ops_ · Retail-execution audit gap
72. **Offline Festival Scheme Engine** — Pre-loaded promo logic applies festival discounts and combos at the counter. · _sales_ · Seasonal scheme management
73. **Resilient Receipt Numbering** — Gap-free, collision-free invoice numbers across offline devices via reserved ranges. · _CA_ · Duplicate invoice-number audits
74. **Field Insurance Micro-Sale** — Sell embedded micro-insurance with goods at the counter, premium collected offline. · _customer_ · Embedded-finance distribution
75. **Just-in-Time Field Credit** — Offer instant working-capital credit to a customer at point of order, pre-approved offline. · _customer_ · OCEN point-of-need lending
76. **Offline Cash-Flow Snapshot** — Owner sees live cash position from local books without waiting on cloud. · _owner_ · "Profitable but no cash" blind spot
77. **Geo-Tagged Vendor Pickup** — Records location and photo when collecting goods/returns from a supplier. · _ops_ · Procurement proof gap
78. **Field Refund-on-Spot** — Issue instant UPI/cash refunds in the field with full offline audit trail. · _customer_ · Refund delays hurt trust
79. **Wearable Approval Tap** — Owner approves a queued high-value payment from a smartwatch notification. · _owner_ · On-the-move decision speed
80. **Offline Multilingual Invoice Print** — Print bills in the customer's regional script chosen at the counter. · _customer_ · Local-language receipt gap
81. **Low-Connectivity Onboarding** — New field customers onboarded offline; KYC verifies in the background on reconnect. · _sales_ · Slow rural onboarding
82. **Adaptive Sync Backoff** — Detects congested towers and backs off retries to avoid draining battery/data. · _ops_ · Network-storm device drain
83. **Field Damage/Claim Capture** — Photo + voice + geo logs a damaged-goods claim that opens a credit note workflow. · _ops_ · Claims documentation gap
84. **Offline Split Payments** — Customer pays part cash, part UPI, part credit; all reconcile correctly offline. · _customer_ · Mixed-tender handling
85. **Peer Device Backup** — Each field phone mirrors its ledger to a trusted teammate's device as offline redundancy. · _ops_ · Single-device data-loss risk
86. **Edge Demand Forecast** — On-device model suggests reorder quantities per shop from local sales history. · _owner_ · Stockout/overstock in kirana
87. **Field Agent Geo-Fence Alerts** — Owner is notified if an agent leaves the assigned beat with undeposited cash. · _owner_ · Cash-carrying risk
88. **Offline Statement Export** — Generate a customer/vendor statement PDF on-device to hand over or print instantly. · _finance_ · On-spot statement requests
89. **Drive-Thru / Curbside Capture** — Geo-detects a customer at the kerb and pre-loads their pending order for billing. · _customer_ · Curbside-commerce gap
90. **Resilient OTP-Less Auth** — Biometric on-device login so field staff work without waiting for SMS OTPs. · _ops_ · OTP delays block field work
91. **Offline GST Self-Audit** — On-device checks flag missing HSN, wrong rates, or B2B-without-GSTIN before sync. · _CA_ · Notice-prevention at source
92. **Field Cash Denomination Counter** — Camera counts a cash bundle by denomination to verify a collection. · _finance_ · Manual cash-count errors
93. **Pre-Cached AA Consent** — Customer's Account Aggregator consent captured offline, executed on reconnect for credit. · _customer_ · DPI consent in low-network areas
94. **Offline Festival Cash Forecast** — Predicts cash needs for Diwali/harvest peaks from on-device trends. · _owner_ · Seasonal-swing cash planning
95. **Solar-Charge Field Mode** — Ultra-low-power UI variant for solar-charged devices in off-grid markets. · _ops_ · Off-grid rural power
96. **Geo-Stamped Vendor Settlement** — Pay a supplier in person via UPI with location proof attached to the entry. · _finance_ · Cash-purchase verification
97. **Offline Dispute Locker** — All field-dispute evidence (photo/voice/GPS) bundled and timestamped for later resolution. · _ops_ · Evidence loss in disputes
98. **Adaptive UI for Aging Eyes** — Field-detects screen glare and shaky hands, enlarging targets for older shopkeepers. · _owner_ · Accessibility for Bharat owners
99. **Mesh Money Relay** — Phones in a market relay each other's offline payments peer-to-peer toward any online node. · _customer_ · Connectivity dead-zones
100. **Satellite-Direct Settlement** — Phones beam transactions to LEO satellites where no tower exists, settling within minutes. · _ops_ · True last-mile/forest/desert finance
101. **Offline CBDC e-Rupee Wallet** — Programmable e-rupee transacts device-to-device offline like physical cash. · _customer_ · CBDC offline-cash vision
102. **Peer-to-Peer Token Settlement** — Two merchants net out mutual dues via signed tokens offline, settling on-chain later. · _finance_ · Inter-merchant credit netting
103. **AR Field-Finance Glasses** — Smart glasses overlay a customer's dues and credit limit over their face/shop on arrival. · _sales_ · Hands-free field intelligence
104. **Holographic Counter Bill** — Projects an itemized bill into the air above the counter for the customer to confirm. · _customer_ · Frictionless billing UX
105. **Autonomous Collection Drone** — Drone visits remote farms, accepts CBDC, issues receipts, returns route data autonomously. · _ops_ · Unreachable rural collections
106. **Self-Driving Van-Sales Pod** — Autonomous vehicle restocks kiranas, bills, collects, and reconciles with zero human rep. · _sales_ · Last-mile labor scarcity
107. **Neural Quick-Entry** — Subvocal/neural-interface lets an owner log a sale by thinking it, hands fully free. · _owner_ · Ultimate frictionless capture
108. **Ambient Counter Listening** — Edge AI hears a verbal sale ("two kilos rice, paid cash") and books it autonomously. · _owner_ · Zero-touch counter accounting
109. **Edge Digital-Twin of the Shop** — A live on-device twin simulates cash, stock, and credit even fully offline. · _owner_ · Predictive ops without cloud
110. **Autonomous Field Agent AI** — A goal-driven agent plans the route, negotiates dues, and collects, reporting to the owner. · _ops_ · Agentic field-finance future
111. **Agent-to-Agent Beat Negotiation** — The distributor's AI and the kirana's AI negotiate order, price, and credit terms offline. · _sales_ · Agentic B2B commerce
112. **Self-Healing Sync Fabric** — The network auto-reroutes ledger sync through any reachable device or satellite path. · _ops_ · Infrastructure-independent finance
113. **Quantum-Signed Field Receipts** — Receipts carry post-quantum signatures so offline proofs stay forever tamper-proof. · _CA_ · Long-horizon audit integrity
114. **Predictive Cash Drop Routing** — AI pre-computes the safest, fastest cash-deposit path before the agent sets out. · _finance_ · Cash-in-transit optimization
115. **Biometric Palm-Pay Counter** — Customer pays by palm-vein scan at the counter, working offline against a cached wallet. · _customer_ · Card/phone-less payment
116. **Field Voice Translator Settlement** — Real-time speech translation lets a rep settle dues across any Indian language barrier. · _sales_ · Multilingual field friction
117. **Self-Stocking Smart Shelf** — IoT shelf detects a sale, books revenue, and triggers reorder — all edge-local. · _owner_ · Autonomous inventory accounting
118. **Drone Stock-Audit Swarm** — A swarm photographs and counts a warehouse offline, posting variances on reconnect. · _ops_ · Warehouse audit at scale
119. **Ambient Geo-Credit Offers** — As an owner nears a supplier, edge AI surfaces a pre-approved purchase-finance offer. · _customer_ · Just-in-time embedded credit
120. **Offline Programmable Escrow** — Smart-contract escrow holds a field payment until delivery is geo-confirmed, all offline. · _finance_ · Trust in field B2B deals
121. **Neural-Net Edge Reconciliation** — On-device AI matches the day's payments, bills, and bank slips with no human touch. · _CA_ · Zero-touch field reconciliation
122. **Self-Optimizing Beat Drone Fleet** — A drone fleet rebalances delivery/collection routes live as orders and dues change. · _ops_ · Dynamic field logistics
123. **Holo-Twin Negotiation Room** — Owner meets a supplier's AI as a holographic avatar to settle dues face-to-face anywhere. · _owner_ · Remote relationship finance
124. **Edge Carbon-Stamped Txns** — Each field transaction is tagged with its carbon footprint computed on-device. · _CA_ · ESG/carbon accounting future
125. **Autonomous Micro-ATM Pod** — A self-service kiosk dispenses/accepts cash and CBDC in villages, fully self-reconciling. · _customer_ · Rural cash-access gap
126. **Swarm-Verified Collections** — Nearby field devices cross-attest a collection's GPS and amount for fraud-proof consensus. · _finance_ · Distributed-trust verification
127. **Brain-Computer Approval** — Owner approves or rejects a queued payment by intent alone via a neural band. · _owner_ · Instant frictionless authority
128. **Self-Driving Cash Vault** — An autonomous armored pod collects deposits along a route, settling to banks in real time. · _finance_ · Cash-handling labor/risk
129. **Edge Predictive Credit Limit** — On-device twin recomputes each customer's safe credit limit live from field behavior. · _sales_ · Dynamic credit-risk control
130. **Ambient Festival Surge Pricing** — Edge AI adjusts counter prices in real time to demand, inventory, and rival prices offline. · _owner_ · Dynamic-pricing for micro-retail
131. **Autonomous Dispute Resolver** — Field-dispute AI weighs photo/voice/GPS evidence and proposes a binding settlement instantly. · _ops_ · Slow dispute cycles
132. **Holographic Field Statement** — Project a customer's full financial relationship as an interactive 3D model on the spot. · _sales_ · Persuasive on-site finance
133. **Satellite-Mesh Rural Banking Hub** — A village node aggregates everyone's offline finance and uplinks via satellite nightly. · _owner_ · Whole-village financial inclusion
134. **Self-Sovereign Field Identity** — Customer's portable, offline-verifiable digital ID unlocks credit and KYC anywhere. · _customer_ · DPDP-aligned portable identity
135. **Edge Agentic Tax Filing** — On-device agent assembles field GST data and files the return the moment connectivity appears. · _CA_ · Zero-touch compliance future
136. **Autonomous Inventory Drone-Restock** — Drones detect a shelf gap via edge vision and dispatch a restock order autonomously. · _owner_ · Self-replenishing micro-retail
137. **Neural Cash-Flow Premonition** — Edge AI warns the owner of a coming cash crunch days ahead from field signals alone. · _owner_ · #1 killer: cash-flow surprises
138. **Programmable Mesh Payroll** — Field staff wages stream device-to-device per geo-verified task, no central server needed. · _ops_ · Real-time gig/field payroll
139. **Self-Evolving Offline Model** — The on-device finance AI retrains overnight on local data, improving without the cloud. · _ops_ · Edge-AI autonomy frontier
140. **Planetary Field-Finance Grid** — Any merchant anywhere — forest, sea, orbit — transacts on a self-healing satellite-edge money mesh. · _owner_ · Finance with zero connectivity assumptions
