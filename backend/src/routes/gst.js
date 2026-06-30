const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });


// GET /api/gst/liability - compute current GSTR-3B fields from transactions
router.get("/liability", authenticate, async (req, res) => {
  const { month, year } = req.query;
  const now  = new Date();
  const m    = month ? parseInt(month) : now.getMonth() + 1;
  const y    = year  ? parseInt(year)  : now.getFullYear();
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to   = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

  // Pull firm settings for GST rate
  const { rows: kvRows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1",
    [req.user.tenant_id]
  );
  const firm    = kvRows[0]?.value?.value?.firm ?? {};
  const gstRate = parseFloat(firm.gstRate ?? 18) / 100;

  // Pull transactions in period from KV store
  const txns = (kvRows[0]?.value?.value?.transactions ?? []).filter(
    t => t.date >= from && t.date <= to
  );

  const revenue  = txns.filter(t => t.amount > 0 && t.category === "revenue").reduce((s,t) => s+t.amount, 0);
  const expenses = txns.filter(t => t.amount < 0 && ["expense","payroll","procurement"].includes(t.category)).reduce((s,t) => s+Math.abs(t.amount), 0);

  const output_tax       = parseFloat((revenue * gstRate).toFixed(2));
  const input_tax_credit = parseFloat((expenses * gstRate * 0.5).toFixed(2)); // proxy: ~50% of expenses are GST-eligible
  const net_liability    = parseFloat(Math.max(0, output_tax - input_tax_credit).toFixed(2));

  // Tax period breakdown (CGST + SGST for intrastate, IGST for interstate)
  const breakdown = {
    taxable_turnover: revenue,
    output_cgst: parseFloat((output_tax / 2).toFixed(2)),
    output_sgst: parseFloat((output_tax / 2).toFixed(2)),
    output_igst: 0,
    itc_cgst:    parseFloat((input_tax_credit / 2).toFixed(2)),
    itc_sgst:    parseFloat((input_tax_credit / 2).toFixed(2)),
    itc_igst:    0,
    net_liability,
  };

  res.json({ month: m, year: y, output_tax, input_tax_credit, net_liability, breakdown });
});

// GET /api/gst/returns - list all GST returns for tenant
router.get("/returns", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM gst_returns WHERE tenant_id=$1 ORDER BY period_year DESC, period_month DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/gst/returns - create/compute a GST return for a month
router.post("/returns", authenticate, canWrite, async (req, res) => {
  const { return_type = "GSTR-3B", period_month, period_year } = req.body;
  if (!period_month || !period_year) return res.status(400).json({ error: "period_month and period_year required" });

  const { rows: kvRows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1",
    [req.user.tenant_id]
  );
  const firm    = kvRows[0]?.value?.value?.firm ?? {};
  const gstRate = parseFloat(firm.gstRate ?? 18) / 100;

  const from = `${period_year}-${String(period_month).padStart(2, "0")}-01`;
  const to   = `${period_year}-${String(period_month).padStart(2, "0")}-${new Date(period_year, period_month, 0).getDate()}`;
  const txns = (kvRows[0]?.value?.value?.transactions ?? []).filter(t => t.date >= from && t.date <= to);

  const revenue  = txns.filter(t => t.amount > 0 && t.category === "revenue").reduce((s,t) => s+t.amount, 0);
  const expenses = txns.filter(t => t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
  const output_tax       = parseFloat((revenue * gstRate).toFixed(2));
  const input_tax_credit = parseFloat((expenses * gstRate * 0.5).toFixed(2));
  const net_liability    = parseFloat(Math.max(0, output_tax - input_tax_credit).toFixed(2));
  const computed_data    = { taxable_turnover: revenue, expense_base: expenses };

  const { rows: [ret] } = await pool.query(
    `INSERT INTO gst_returns(tenant_id, return_type, period_month, period_year, output_tax, input_tax_credit, net_liability, computed_data)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(tenant_id, return_type, period_month, period_year)
     DO UPDATE SET output_tax=$5, input_tax_credit=$6, net_liability=$7, computed_data=$8, status='draft'
     RETURNING *`,
    [req.user.tenant_id, return_type, period_month, period_year, output_tax, input_tax_credit, net_liability, JSON.stringify(computed_data)]
  );
  res.status(201).json(ret);
});

// POST /api/gst/irn - generate IRN stub (delegates to Masters India GSP in production)
router.post("/irn", authenticate, canWrite, async (req, res) => {
  const { invoice_id } = req.body;
  if (!invoice_id) return res.status(400).json({ error: "invoice_id required" });

  const { rows: [inv] } = await pool.query(
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
    [invoice_id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  // Production: call Masters India GSP API
  // POST https://api.mastersindia.co/einvoice/generate
  // For now: return demo IRN
  if (process.env.MASTERS_INDIA_API_KEY) {
    // TODO: real GSP call
  }

  const irn = `DEMO-IRN-${Date.now()}-${inv.invoice_number.replace(/[^A-Z0-9]/g, "")}`;
  await pool.query("UPDATE invoices SET irn=$1 WHERE id=$2", [irn, inv.id]);
  res.json({ irn, qr_code_url: null, demo: !process.env.MASTERS_INDIA_API_KEY });
});

// GET /api/gst/calendar - next 4 statutory due dates
router.get("/calendar", authenticate, async (_req, res) => {
  const now   = new Date();
  const dates = [];

  for (let offset = 0; offset < 4; offset++) {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y    = base.getFullYear();
    const m    = base.getMonth();

    const gstr3b = new Date(y, m, 20);
    if (gstr3b >= now) dates.push({ label: "GSTR-3B", due: gstr3b.toISOString().split("T")[0], penalty: "₹50/day after due date" });

    const tds = new Date(y, m, 7);
    if (tds >= now) dates.push({ label: "TDS deposit", due: tds.toISOString().split("T")[0], penalty: "1.5% per month" });

    if ([2, 5, 8, 11].includes(m)) {
      const adv = new Date(y, m, 15);
      if (adv >= now) dates.push({ label: "Advance Tax", due: adv.toISOString().split("T")[0], penalty: "1% per month under Section 234C" });
    }
  }

  dates.sort((a, b) => a.due.localeCompare(b.due));
  res.json(dates.slice(0, 6));
});

// ── GSTIN verification ────────────────────────────────────────────────────────
const GST_STATE = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "28": "Andhra Pradesh (old)",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory",
};

// Verify a GSTIN's structure + check digit. This is fully offline and real - the
// 15th character is a modulo-36 checksum over the first 14, so a typo is caught
// deterministically. Returns the embedded state + PAN. We do NOT invent a trade
// name; a live registry lookup only happens when a verification provider is set.
function gstinChecksumValid(gstin) {
  const code = (c) => (c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 55); // 0-9, A-Z → 0-35
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = code(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  const checkVal = (36 - (sum % 36)) % 36;
  const checkChar = checkVal < 10 ? String(checkVal) : String.fromCharCode(checkVal + 55);
  return checkChar === gstin[14];
}

// GET /api/gst/verify?gstin=… - structural/checksum validation (always), plus a
// live registry lookup when KYC_API_KEY is configured.
router.get("/verify", authenticate, async (req, res) => {
  const gstin = String(req.query.gstin || "").toUpperCase().trim();
  const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!FORMAT.test(gstin)) {
    return res.status(400).json({ valid: false, status: "invalid", reason: "format", message: "Not a valid GSTIN format." });
  }
  if (!gstinChecksumValid(gstin)) {
    return res.status(200).json({ valid: false, status: "invalid", reason: "checksum", message: "GSTIN check digit failed - likely a typo." });
  }
  const stateCode = gstin.slice(0, 2);
  const base = {
    valid: true,
    gstin,
    state: GST_STATE[stateCode] || "Unknown",
    stateCode,
    pan: gstin.slice(2, 12),
    source: "format", // structural + checksum only, not a registry lookup
  };

  // Live GSTN registry lookup (trade name, status, registration date) only when a
  // provider key is set - otherwise we honestly return the format result, never a
  // fabricated company name/status.
  if (!process.env.KYC_API_KEY) {
    return res.json({ ...base, status: "format_ok", message: "Format & check digit valid. Live registry lookup not configured." });
  }
  try {
    // Provider call goes here (e.g. Signzy/IDfy/Masters India GST verify API).
    // Until wired, surface format result honestly rather than guessing.
    return res.json({ ...base, status: "format_ok", message: "Format & check digit valid. Connect a GST verification provider for live status." });
  } catch {
    return res.json({ ...base, status: "format_ok", message: "Format valid; live lookup unavailable." });
  }
});

module.exports = router;
