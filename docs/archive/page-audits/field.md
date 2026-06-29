## Field & Offline (`/field`) — 28 tools

Counter-, van- and doorstep-grade finance tools that bill, collect and reconcile on weak/no signal, then sync when the network returns. Stakeholders: sales, ops, owner. Backend: KV-synced via `useFeatureState` (shared `field-*` keys), with a common offline action queue (`field-queue`) that several tools write into; "Sync now"/"Flush" mark items committed locally to stage them — real server sync runs through the app's sync engine on reconnect. NOTE: connectivity (`navigator.onLine` + online/offline events, Network Information API), geolocation, device camera (`capture="environment"`) and canvas are all feature-detected with graceful fallbacks. Tab count excludes the Overview hub (29 tabs total: Overview + 28 tools).

- **Overview** — no inputs → renders KPI cards (network online/offline, pending-sync count vs total captured, firm name) + an explainer + a clickable grid jumping to every other tab → orientation hub. _Persist: reads `field-queue`, live network state, `store.firm`._ _Class: Preview._

- **Connectivity Status** (`connectivity`) — no inputs; reads `navigator.onLine`, online/offline events and the Network Information API (`connection.change`) → shows live online/offline badge, time-of-last-change, and `navigator.onLine` / effective type / downlink (Mbps) / data-saver fields ("Not reported" where unsupported) → connectivity diagnostic. _Persist: none (live state)._ _Class: Backend (live browser APIs)._

- **Offline Queue** (`queue`) — description, amount (₹), type (sale/collection/visit/day-sheet/receipt) → "Capture" appends a pending `QueueItem`; "Sync now" flips pending→synced only when online; per-row delete; "Clear all" → staged offline ledger table with synced/pending status. _Persist: `field-queue`._ _Class: KV (sync simulated; honest "pending" marking)._

- **Kirana Quick-Bill** (`quickbill`) — item name, qty, price lines (Enter-to-add) + merchant UPI ID → computes line totals and grand total, builds a real `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` deep link to collect, "Save bill to queue" pushes a `sale` QueueItem → counter bill. _Persist: bill lines local state; UPI id in `field-upi-id`; saved bill → `field-queue`._ _Class: KV (UPI link is a real backend-grade deep link; bill itself queued)._

- **Field Collection** (`collection`) — customer, amount (₹), mode (cash/UPI), optional GPS stamp via Geolocation API → records a `collection` QueueItem with timestamp + optional `GPS lat,lng` meta as proof against fake-collection disputes → queued collection. _Persist: `field-queue`._ _Class: KV (GPS via live browser Geolocation; queued)._

- **Van Day-Sheet** (`daysheet`) — opening stock, sales, returns, cash collected (all ₹) → derives closing stock (open − sold + returns), expected cash (sales − returns) and variance (cash − expected, color-coded reconciled/excess/short); "Settle" pushes a `daysheet` QueueItem with closing+variance meta → route reconciliation. _Persist: inputs local state; settlement → `field-queue`._ _Class: KV (computed; queued)._

- **Low-Data Mode** (`lowdata`) — toggle switch; reads device `connection.saveData` → flips a stored low-data preference and lists what it would do (defer photos/charts/avatars, disable polling, batch the queue) → data-saver switch. _Persist: `field-low-data`; reads live `saveData`._ _Class: Indicative (toggle stored; behaviour described, deferral wired where media is fetched)._

- **Visit Log** (`visits`) — customer (req), purpose, outcome, follow-up → logs a visit record AND mirrors a `visit` QueueItem (outcome/purpose meta); per-row delete → field-call history table. _Persist: `field-visits` + `field-queue`._ _Class: KV._

- **Day Summary** (`summary`) — no inputs; filters `field-queue` to today → KPI cards: field sales (sale+daysheet), cash/UPI collected (collection), visits logged, awaiting-sync count → owner end-of-day rollup. _Persist: reads `field-queue`._ _Class: KV (derived/read-only)._

- **Beat / Route Plan** (`beat`) — next-stop customer (Enter-to-add) → ordered stop list with reorder (↑/↓), per-stop done toggle, delete, and done/total counter → day's visit route. _Persist: `field-beat`._ _Class: KV._

- **Receipt Capture** (`receipt`) — photo via camera/file picker (`capture="environment"`) + note → saves a receipt (data-URL preview if ≤1.5 MB, else stored by filename) and mirrors a `receipt` QueueItem; thumbnail gallery with delete → bill/challan capture. _Persist: `field-receipts` + `field-queue`._ _Class: KV (real camera/FileReader; large images stored by name)._

- **Beat Check-In** (`attendance`) — beat/market place name; Check in / Check out buttons (gated so you can't double-punch) → records geo+time attendance entries (GPS lat,lng when granted, else time-only) → anti-ghost-visit attendance log (last 12 shown). _Persist: `field-attendance`._ _Class: KV (live Geolocation; graceful no-GPS fallback)._

- **Order Booking** (`order`) — customer/shop (req) + item/qty/rate lines → computes order value, "Book order" pushes a `sale` QueueItem with line-item meta → offline beat order. _Persist: order lines local state; booking → `field-queue`._ _Class: KV._

- **Beat Outstanding** (`outstanding`) — customer filter; reads live `store.invoices` (non-paid, oldest-due first) → table of dues with status (overdue/pending); "Collect" pushes a `collection` QueueItem against the invoice number → on-beat dues collection. _Persist: reads `store.invoices`; collections → `field-queue`._ _Class: Backend (live invoice book) + KV (queued collection)._

- **On-the-Go Expense** (`expense`) — category (Fuel/Toll/Food/Loading/Phone/Other), amount (₹), optional note → logs a field expense, mirrors a `receipt` QueueItem, shows today's running total; recent list (15) with delete → travel/field spend log. _Persist: `field-expenses` + `field-queue`._ _Class: KV._

- **Stock Request** (`stockreq`) — item, qty, urgent flag (per-line) → builds a replenishment list; "Send request" pushes a `visit` QueueItem summarising items (with urgent tags) → warehouse stock-out request. _Persist: `field-stock-req` + `field-queue`._ _Class: KV._

- **Signature Capture** (`signature`) — customer name + on-screen canvas signature (pointer drawing; canvas feature-gated with fallback message) → saves signature as PNG data-URL; gallery with delete → credit-sale/delivery acknowledgement proof. _Persist: `field-signatures`._ _Class: KV (real canvas `toDataURL`; degrades if canvas unsupported)._

- **Proof of Delivery** (`pod`) — customer/delivery point (req), delivery photo (camera, ≤1.5 MB inline else by reference), note, optional GPS → saves a POD record and mirrors a `visit` QueueItem (POD/GPS meta); thumbnail gallery → delivery dispute settlement. _Persist: `field-pod` + `field-queue`._ _Class: KV (live camera + Geolocation)._

- **Daily Target** (`target`) — sales-target (₹) and visits-target inputs → live progress bars read from today's `field-queue` (sales+collection+daysheet vs sales target; visit count vs visit target), with both-hit celebration → rep goal tracker. _Persist: `field-target-sales`, `field-target-visits`; reads `field-queue`._ _Class: KV (derived progress)._

- **KM Expense Claim** (`km`) — from/to legs, distance (km), rate (₹/km); Mark start / End→auto-fill via Geolocation (Haversine straight-line distance) → computes claim amount, pushes a `receipt` QueueItem (km×rate, GPS flag), shows today's km+amount and trip history (12) → travel reimbursement by distance. _Persist: `field-km-trips`, `field-km-rate`; claim → `field-queue`._ _Class: KV (real GPS Haversine; honest "straight-line floor" note)._

- **Market Intel** (`intel`) — competitor/brand (req), product (req), their price (req ₹), our price (optional), note → logs intel, computes our-vs-their price gap (dearer/cheaper/level), mirrors a `visit` QueueItem → competitor pricing capture (works fully offline). _Persist: `field-intel` + `field-queue`._ _Class: KV._

- **Asset / Meter Log** (`meter`) — asset/meter name, reading value, unit (units/litres/kWh/km/hrs/kg) → logs reading, computes consumption delta vs the last reading of the same asset (case-insensitive), mirrors a `visit` QueueItem; recent list (15) → on-site meter/odometer log. _Persist: `field-meter` + `field-queue`._ _Class: KV (computed delta)._

- **Field Issue Ticket** (`issue`) — title (req), priority (low/medium/high), note, photo (camera), optional GPS → raises a ticket (priority dot, GPS/time meta), mirrors a `visit` QueueItem; resolve/reopen toggle, delete, open-count; recent list (15) → on-site problem escalation. _Persist: `field-issues` + `field-queue`._ _Class: KV (live camera + Geolocation)._

- **On-Site Quotation** (`quote`) — customer (req) + item/qty/rate lines, discount % and GST % → computes subtotal, discount, taxable, GST, grand total; "Save quotation" pushes a `visit` QueueItem (item count, total incl. GST) → at-premises priced offer (queues as visit, not a posted invoice). _Persist: `field-quote-gst`, `field-quote-disc`; quote → `field-queue`._ _Class: KV (computed totals; queued)._

- **Route-Wise Sales** (`routesales`) — per-entry route/beat tag inputs; reads today's money entries (sale/daysheet/collection) from `field-queue` → groups by route into a sales/collections/count table sorted by total, plus active-routes/sales/collections KPIs → where today's money came from (fully offline). _Persist: `field-route-tags` (id→route map); reads `field-queue`._ _Class: KV (derived rollup)._

- **Cash Handover** (`handover`) — denomination counts (₹500/200/100/50/20/10), "Handed to" → sums counted cash, compares against today's queued collections (expected), shows variance; "Record handover" pushes a `daysheet` QueueItem (expected+variance meta) → end-of-beat deposit reconciliation. _Persist: counts/handedTo local state; handover → `field-queue`; reads `field-queue`._ _Class: KV (computed; coins ignored)._

- **Discount Approval** (`discount`) — field self-approval cap %, customer, bill amount (₹), discount asked % → computes discount value, flags within-cap vs over-cap (needs owner approval), pushes a `visit` QueueItem (auto-approved or pending-approval meta) → margin-control discount gate. _Persist: `field-discount-cap`; decision → `field-queue`._ _Class: KV (policy check; queued)._

- **Sync Health** (`synchealth`) — no inputs; derives from `field-queue` + `navigator.onLine` → status (healthy/ready/waiting), pending count, oldest-pending age (stale >60 min warning), network state; "Flush pending" marks staged entries committed when online → reconnect-readiness dashboard. _Persist: reads/writes `field-queue`; live network._ _Class: KV (derived; flush simulated, real sync on reconnect)._
