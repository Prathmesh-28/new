const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const VALID_CATEGORIES = ["revenue", "expense", "payroll", "loan", "tax", "transfer"];

const FEW_SHOT = `You are a financial transaction categorizer for Indian SMBs. Given a merchant name and description, return exactly one category from: revenue, expense, payroll, loan, tax, transfer.

Rules:
- revenue: customer payments, sales, service income
- expense: vendor payments, utilities, rent, subscriptions
- payroll: salary, wages, PF, ESIC, gratuity
- loan: EMI, loan repayment, bank charges on loans
- tax: GST, TDS, advance tax, income tax payments
- transfer: bank-to-bank, internal transfers

Reply with ONLY the category word, nothing else.`;

async function categorizeOne(merchant, description, tenantId) {
  // 1. Check tenant-specific cache
  const cacheKey = merchant.toLowerCase().trim();
  const { rows: tenantRows } = await pool.query(
    "SELECT category FROM merchant_categories WHERE merchant_name=$1 AND tenant_id=$2 LIMIT 1",
    [cacheKey, tenantId]
  ).catch(() => ({ rows: [] }));
  if (tenantRows[0]) return { category: tenantRows[0].category, source: "cache_tenant" };

  // 2. Check global cache
  const { rows: globalRows } = await pool.query(
    "SELECT category FROM merchant_categories WHERE merchant_name=$1 AND tenant_id IS NULL LIMIT 1",
    [cacheKey]
  ).catch(() => ({ rows: [] }));
  if (globalRows[0]) return { category: globalRows[0].category, source: "cache_global" };

  // 3. Claude Haiku
  if (!process.env.ANTHROPIC_API_KEY) return { category: "expense", source: "default" };

  const Anthropic = require("@anthropic-ai/sdk");
  const client    = new Anthropic.default();
  const text      = `Merchant: ${merchant}\nDescription: ${description}`;
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001", max_tokens: 10,
    system: FEW_SHOT,
    messages: [{ role: "user", content: text }],
  });
  const raw = (resp.content[0]?.text ?? "expense").toLowerCase().trim();
  const category = VALID_CATEGORIES.includes(raw) ? raw : "expense";

  // Store in cache
  await pool.query(
    `INSERT INTO merchant_categories(merchant_name, tenant_id, category, source)
     VALUES($1,$2,$3,'ai')
     ON CONFLICT(merchant_name, tenant_id) DO UPDATE SET category=$3, source='ai', updated_at=now()`,
    [cacheKey, tenantId, category]
  ).catch(() => {});

  return { category, source: "haiku" };
}

// POST /api/ai/ask — proxies to Claude
router.post("/ask", authenticate, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "AI not configured" });
  const { messages, system } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "messages required" });
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic.default();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 1024,
      system: system || "You are a financial operations assistant for a small business. Be concise and actionable.",
      messages,
    });
    res.json({ content: resp.content[0]?.text ?? "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/scan-receipt — extract fields from a receipt/invoice photo (Claude vision)
// body: { image: "data:image/...;base64,...." }  → { amount, date, vendor, category, description }
router.post("/scan-receipt", authenticate, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "AI not configured" });
  const { image } = req.body || {};
  const m = typeof image === "string" && image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/s);
  if (!m) return res.status(400).json({ error: "image (base64 data URL) required" });
  const [, mediaType, b64] = m;
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic.default();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 400,
      system: `Extract the key fields from this receipt/invoice/bill image for an Indian SMB's books. Return ONLY a JSON object, no prose:
{"vendor": string, "amount": number (total, in rupees, no symbols/commas), "date": "YYYY-MM-DD" or null, "category": one of revenue|expense|payroll|loan|tax|transfer, "description": short string}
If a field is unreadable use null. amount is the grand total.`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text", text: "Extract the fields as JSON." },
        ],
      }],
    });
    const raw = resp.content[0]?.text ?? "{}";
    const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    const parsed = JSON.parse(json);
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "expense";
    res.json({
      vendor: typeof parsed.vendor === "string" ? parsed.vendor.slice(0, 80) : "",
      amount: Number.isFinite(Number(parsed.amount)) ? Math.abs(Number(parsed.amount)) : 0,
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      category,
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 120) : "",
    });
  } catch (err) {
    console.error("[ai] scan-receipt", err.message);
    res.status(500).json({ error: "Couldn't read the receipt. Try a clearer photo." });
  }
});

// POST /api/ai/categorize — single transaction
router.post("/categorize", authenticate, async (req, res) => {
  const { merchant, description = "" } = req.body;
  if (!merchant) return res.status(400).json({ error: "merchant required" });
  try {
    const result = await categorizeOne(merchant, description, req.user.tenant_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/categorize/bulk — up to 100 transactions
router.post("/categorize/bulk", authenticate, async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions) || !transactions.length) return res.status(400).json({ error: "transactions array required" });
  if (transactions.length > 100) return res.status(400).json({ error: "max 100 transactions per bulk call" });

  const results = await Promise.all(
    transactions.map(async t => {
      try {
        const r = await categorizeOne(t.counterparty ?? t.merchant ?? "", t.description ?? "", req.user.tenant_id);
        return { id: t.id, ...r };
      } catch {
        return { id: t.id, category: "expense", source: "error" };
      }
    })
  );
  res.json(results);
});

// POST /api/ai/categorize/feedback — user correction
router.post("/categorize/feedback", authenticate, async (req, res) => {
  const { merchant, category } = req.body;
  if (!merchant || !category) return res.status(400).json({ error: "merchant and category required" });
  if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: "invalid category" });

  await pool.query(
    `INSERT INTO merchant_categories(merchant_name, tenant_id, category, confidence, source)
     VALUES($1,$2,$3,1.0,'user')
     ON CONFLICT(merchant_name, tenant_id) DO UPDATE SET category=$3, confidence=1.0, source='user', updated_at=now()`,
    [merchant.toLowerCase().trim(), req.user.tenant_id, category]
  );
  res.json({ ok: true });
});

module.exports = router;
