const RULES = [
  // ── Revenue ──────────────────────────────────────────────────────────────────
  { test: /razorpay|cashfree|payu|ccavenue|instamojo|stripe|payment\s+gateway/i,  cat: "revenue", merchant: "Payment Gateway" },
  { test: /upi.*cr|neft.*cr|rtgs.*cr|imps.*cr|credited|payment\s+received|received\s+from/i, cat: "revenue", merchant: null },
  { test: /sales?\s+proceeds|invoice\s+payment|settlement/i,                       cat: "revenue", merchant: null },
  // ── Payroll ───────────────────────────────────────────────────────────────────
  { test: /\bsalary\b|payroll|wages|esi\b|epf\b|pf\s+contribution|gratuity|\bbonus\b|nps\b/i, cat: "payroll", merchant: "Payroll" },
  // ── Tax & Compliance ──────────────────────────────────────────────────────────
  { test: /\bgst\b|tds\b|tcs\b|income[\s-]?tax|advance\s+tax|challan|mca\b|roc\b|pt\s+tax/i, cat: "tax", merchant: "Tax Payment" },
  // ── Loans & Finance ───────────────────────────────────────────────────────────
  { test: /\bemi\b|loan\s+repay|term\s+loan|overdraft|credit\s+line|nbfc|interest\s+debit|lendingkart|indifi|flexiloans/i, cat: "loan", merchant: "Loan Payment" },
  // ── Internal Transfers ────────────────────────────────────────────────────────
  { test: /self\s+transfer|own\s+a\/c|internal\s+transfer|sweep\s+out|sweep\s+in/i, cat: "transfer", merchant: "Internal Transfer" },
  // ── Food & Delivery ───────────────────────────────────────────────────────────
  { test: /zomato|swiggy|dunzo|blinkit|zepto|bigbasket|grofers/i, cat: "expense", merchant: "Food & Delivery" },
  // ── E-Commerce ────────────────────────────────────────────────────────────────
  { test: /amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|jiomart/i, cat: "expense", merchant: "E-Commerce" },
  // ── Travel ────────────────────────────────────────────────────────────────────
  { test: /irctc|makemytrip|goibibo|yatra|cleartrip|\bola\b|\buber\b|rapido|indigo|spicejet|air\s+india|akasa/i, cat: "expense", merchant: "Travel" },
  // ── Utilities ────────────────────────────────────────────────────────────────
  { test: /electricity|bescom|msedcl|bses|tata\s+power|water\s+bill|\bgas\s+bill|mahanagar\s+gas|airtel|jio\b|vodafone|\bvi\b|bsnl|dish\s+tv|tata\s+sky/i, cat: "expense", merchant: "Utilities" },
  // ── Office & Rent ────────────────────────────────────────────────────────────
  { test: /office\s+rent|shop\s+rent|premises\s+rent|building\s+rent|co[\s-]?working/i, cat: "expense", merchant: "Office Rent" },
  // ── Procurement / Inventory ───────────────────────────────────────────────────
  { test: /\bpurchase\b|procurement|supplier|vendor|raw\s+material|\binventory\b|\bstock\b|goods\s+purchase/i, cat: "expense", merchant: "Procurement" },
  // ── Marketing ────────────────────────────────────────────────────────────────
  { test: /google\s+ads|facebook\s+ads|meta\s+ads|instagram\s+ads|linkedin\s+ads|advertising/i, cat: "expense", merchant: "Marketing" },
];

/**
 * Normalise a single transaction description.
 * Returns { category, merchantName }.
 */
function normalise(description, amount) {
  if (!description) {
    return { category: amount >= 0 ? "revenue" : "expense", merchantName: null };
  }
  for (const rule of RULES) {
    if (rule.test.test(description)) {
      return { category: rule.cat, merchantName: rule.merchant };
    }
  }
  return { category: amount >= 0 ? "revenue" : "expense", merchantName: null };
}

/**
 * Normalise an array of transaction objects.
 * Each must have { description, amount }.
 * Returns array with category + merchantName merged in.
 */
function normaliseMany(txns) {
  return txns.map(t => {
    const { category, merchantName } = normalise(t.description || t.description_raw || "", Number(t.amount));
    return { ...t, category, merchant_name: merchantName ?? t.merchant_name ?? null };
  });
}

module.exports = { normalise, normaliseMany };
