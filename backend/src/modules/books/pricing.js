// Selling-side pricing: pricing rules (rate override / discount / margin + BXGY
// free-goods schemes), coupons (validity + redemption limits + once-per-customer),
// and shipping/freight slabs. Mirrors ERPNext's Pricing Rule resolution: collect
// every applicable active in-validity rule for a line, then let the single
// highest-priority winner act on it. All money stays as decimal-backed strings.
const { pool } = require("../../db");
const { money, toDb, gt } = require("./money");
const { PostError } = require("./posting-engine");

// ───────────────────────── Pricing rules: master CRUD ─────────────────────────
async function createPricingRule(tenantId, r) {
  if (!r || !r.title) throw new PostError("BAD_INPUT", "title required", 400);
  const appliesOn = r.appliesOn || "all";          // item | group | brand | all
  if (!["item", "group", "brand", "all"].includes(appliesOn))
    throw new PostError("BAD_INPUT", "applies_on must be item/group/brand/all", 400);
  const partyScope = r.partyScope || "all";          // customer | group | territory | all
  if (!["customer", "group", "territory", "all"].includes(partyScope))
    throw new PostError("BAD_INPUT", "party_scope must be customer/group/territory/all", 400);
  const action = r.action || "discount_pct";          // rate | discount_pct | discount_amt | margin
  if (!["rate", "discount_pct", "discount_amt", "margin"].includes(action))
    throw new PostError("BAD_INPUT", "action must be rate/discount_pct/discount_amt/margin", 400);
  const scheme = r.scheme || "none";                  // none | bxgy
  if (!["none", "bxgy"].includes(scheme))
    throw new PostError("BAD_INPUT", "scheme must be none/bxgy", 400);
  if (scheme === "bxgy" && !r.freeItemId)
    throw new PostError("BAD_INPUT", "bxgy scheme needs free_item_id", 400);

  const { rows } = await pool.query(
    `INSERT INTO book_pricing_rules
       (tenant_id, title, applies_on, scope_value, party_scope, party_value,
        min_qty, max_qty, min_amount, action, value, scheme, free_item_id, free_qty,
        priority, valid_from, valid_to, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18,true))
     RETURNING *`,
    [
      tenantId, r.title, appliesOn, r.scopeValue || null, partyScope, r.partyValue || null,
      toDb(r.minQty || 0), r.maxQty != null ? toDb(r.maxQty) : null, toDb(r.minAmount || 0),
      action, toDb(r.value || 0), scheme, r.freeItemId || null, toDb(r.freeQty || 0),
      Number(r.priority || 0), r.validFrom || null, r.validTo || null, r.isActive,
    ]
  );
  return rows[0];
}

async function listPricingRules(tenantId) {
  const { rows } = await pool.query(
    "SELECT * FROM book_pricing_rules WHERE tenant_id=$1 ORDER BY priority DESC, created_at DESC",
    [tenantId]
  );
  return rows;
}

async function deletePricingRule(tenantId, id) {
  const { rowCount } = await pool.query(
    "DELETE FROM book_pricing_rules WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  );
  if (!rowCount) throw new PostError("NOT_FOUND", "Pricing rule not found", 404);
  return { deleted: true };
}

// ───────────────────────── Pure evaluator pieces ──────────────────────────────
// Does `rule` apply to `line` for `party` at `date`? Kept pure so it's unit-testable.
function ruleMatchesLine(rule, line, party, dateStr) {
  if (rule.is_active === false) return false;

  // Validity window (inclusive). Compare as YYYY-MM-DD strings — DATE columns.
  const d = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const from = rule.valid_from ? String(rule.valid_from).slice(0, 10) : null;
  const to = rule.valid_to ? String(rule.valid_to).slice(0, 10) : null;
  if (from && d < from) return false;
  if (to && d > to) return false;

  // applies_on + scope_value.
  switch (rule.applies_on) {
    case "item":  if (String(rule.scope_value) !== String(line.itemId)) return false; break;
    case "group": if (String(rule.scope_value) !== String(line.itemGroup)) return false; break;
    case "brand": if (String(rule.scope_value) !== String(line.brand)) return false; break;
    case "all":   break;
    default:      return false;
  }

  // party_scope + party_value. party = { ledgerId, group, territory }.
  switch (rule.party_scope) {
    case "customer":  if (String(rule.party_value) !== String(party.ledgerId)) return false; break;
    case "group":     if (String(rule.party_value) !== String(party.group)) return false; break;
    case "territory": if (String(rule.party_value) !== String(party.territory)) return false; break;
    case "all":       break;
    default:          return false;
  }

  // qty / amount thresholds (line amount = qty * rate, pre-adjustment).
  const qty = money(line.qty || 0);
  const amount = qty.times(money(line.rate || 0));
  if (gt(money(rule.min_qty || 0), qty)) return false;            // qty < min_qty
  if (rule.max_qty != null && gt(qty, money(rule.max_qty))) return false; // qty > max_qty
  if (gt(money(rule.min_amount || 0), amount)) return false;      // amount < min_amount
  return true;
}

// Of the matching rules, pick the winner: highest priority, then most-specific
// applies_on (item > group > brand > all), then newest. Pure.
const _specificity = { item: 3, group: 2, brand: 1, all: 0 };
function pickWinningRule(rules) {
  if (!rules.length) return null;
  return rules.slice().sort((a, b) => {
    if (Number(b.priority || 0) !== Number(a.priority || 0)) return Number(b.priority || 0) - Number(a.priority || 0);
    const sa = _specificity[a.applies_on] || 0, sb = _specificity[b.applies_on] || 0;
    if (sb !== sa) return sb - sa;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  })[0];
}

// Apply a winning rule's action to a base rate, returning the new effective rate
// (as a string). `margin` = base cost rate + value% markup. Pure.
function effectiveRate(rule, baseRate) {
  const base = money(baseRate || 0);
  const v = money(rule.value || 0);
  switch (rule.action) {
    case "rate":         return toDb(v);
    case "discount_pct": return toDb(base.minus(base.times(v).div(100)));
    case "discount_amt": return toDb(base.minus(v));
    case "margin":       return toDb(base.plus(base.times(v).div(100)));
    default:             return toDb(base);
  }
}

// ───────────────────────── applyPricing (the evaluator) ───────────────────────
// lines: [{ itemId, itemGroup?, brand?, qty, rate }]. Returns adjusted lines plus
// any appended zero-rate free-goods lines, and an `applied` audit trail.
async function applyPricing(tenantId, { lines, partyLedgerId, date }) {
  if (!Array.isArray(lines)) throw new PostError("BAD_INPUT", "lines[] required", 400);
  const { rows: rules } = await pool.query(
    "SELECT * FROM book_pricing_rules WHERE tenant_id=$1 AND is_active=true",
    [tenantId]
  );

  // Resolve party metadata once (group/territory) so rules can scope on it. The
  // ledger's account-group is the "customer group"; territory is optional and only
  // present on schemas that carry it, so we read it defensively.
  let party = { ledgerId: partyLedgerId || null, group: null, territory: null };
  if (partyLedgerId) {
    const { rows: lr } = await pool
      .query("SELECT to_jsonb(l) AS j FROM book_ledgers l WHERE tenant_id=$1 AND id=$2", [tenantId, partyLedgerId])
      .catch(() => ({ rows: [] }));
    const j = lr[0] && lr[0].j;
    if (j) party = { ledgerId: j.id, group: j.group_id ?? null, territory: j.territory ?? null };
  }

  const out = [];
  const freeLines = [];
  const applied = [];

  for (const line of lines) {
    const matches = rules.filter((r) => ruleMatchesLine(r, line, party, date));
    const winner = pickWinningRule(matches);
    const adjusted = { ...line, rate: toDb(line.rate || 0), appliedRuleId: null };

    if (winner) {
      adjusted.rate = effectiveRate(winner, line.rate);
      adjusted.appliedRuleId = winner.id;
      applied.push({
        lineItemId: line.itemId, ruleId: winner.id, title: winner.title,
        action: winner.action, scheme: winner.scheme,
        oldRate: toDb(line.rate || 0), newRate: adjusted.rate,
      });

      // BXGY: append a free-goods line at zero rate.
      if (winner.scheme === "bxgy" && winner.free_item_id) {
        const freeQty = gt(money(winner.free_qty || 0), 0) ? toDb(winner.free_qty) : toDb(line.qty || 0);
        freeLines.push({
          itemId: winner.free_item_id, qty: freeQty, rate: toDb(0),
          isFreeGood: true, appliedRuleId: winner.id,
        });
        applied.push({ lineItemId: winner.free_item_id, ruleId: winner.id, scheme: "bxgy", freeQty });
      }
    }
    out.push(adjusted);
  }

  return { lines: [...out, ...freeLines], applied };
}

// ───────────────────────── Coupons ────────────────────────────────────────────
async function createCoupon(tenantId, c) {
  if (!c || !c.code) throw new PostError("BAD_INPUT", "code required", 400);
  const discType = c.discType || "pct";              // pct | amt
  if (!["pct", "amt"].includes(discType))
    throw new PostError("BAD_INPUT", "disc_type must be pct/amt", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_coupons
       (tenant_id, code, disc_type, value, valid_from, valid_to, max_redemptions,
        once_per_customer, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true))
     ON CONFLICT (tenant_id, code) DO UPDATE SET
        disc_type=EXCLUDED.disc_type, value=EXCLUDED.value, valid_from=EXCLUDED.valid_from,
        valid_to=EXCLUDED.valid_to, max_redemptions=EXCLUDED.max_redemptions,
        once_per_customer=EXCLUDED.once_per_customer, is_active=EXCLUDED.is_active
     RETURNING *`,
    [
      tenantId, c.code, discType, toDb(c.value || 0), c.validFrom || null, c.validTo || null,
      c.maxRedemptions != null ? Number(c.maxRedemptions) : null, !!c.oncePerCustomer, c.isActive,
    ]
  );
  return rows[0];
}

// Pure: given a coupon row + order amount, what's the discount (string)?
function couponDiscount(coupon, amount) {
  const amt = money(amount || 0);
  const v = money(coupon.value || 0);
  const disc = coupon.disc_type === "amt" ? v : amt.times(v).div(100);
  // Never discount more than the order itself.
  return toDb(gt(disc, amt) ? amt : disc);
}

// Validate validity / global limit / once-per-customer (tracked atomically in
// kv_store), then bump `redeemed`. Returns { discount, couponId, redeemed }.
async function redeemCoupon(tenantId, { code, partyLedgerId, amount }) {
  if (!code) throw new PostError("BAD_INPUT", "code required", 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM book_coupons WHERE tenant_id=$1 AND code=$2 FOR UPDATE",
      [tenantId, code]
    );
    const coupon = rows[0];
    if (!coupon) throw new PostError("NOT_FOUND", "Coupon not found", 404);
    if (!coupon.is_active) throw new PostError("COUPON_INACTIVE", "Coupon is inactive", 409);

    const today = new Date().toISOString().slice(0, 10);
    if (coupon.valid_from && today < String(coupon.valid_from).slice(0, 10))
      throw new PostError("COUPON_NOT_YET_VALID", "Coupon not yet valid", 409);
    if (coupon.valid_to && today > String(coupon.valid_to).slice(0, 10))
      throw new PostError("COUPON_EXPIRED", "Coupon has expired", 409);
    if (coupon.max_redemptions != null && coupon.redeemed >= coupon.max_redemptions)
      throw new PostError("COUPON_EXHAUSTED", "Coupon redemption limit reached", 409);

    // Once-per-customer: a unique kv_store key per (coupon, party) is the lock.
    if (coupon.once_per_customer) {
      if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required for once-per-customer coupon", 400);
      const ins = await client.query(
        `INSERT INTO kv_store (tenant_id, namespace, key, value)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, namespace, key) DO NOTHING RETURNING id`,
        [tenantId, "coupon_redemption", `${coupon.id}:${partyLedgerId}`, JSON.stringify({ at: today })]
      );
      if (!ins.rows[0]) throw new PostError("COUPON_ALREADY_USED", "Coupon already used by this customer", 409);
    }

    const discount = couponDiscount(coupon, amount);
    const { rows: upd } = await client.query(
      "UPDATE book_coupons SET redeemed=redeemed+1 WHERE id=$1 RETURNING redeemed",
      [coupon.id]
    );
    await client.query("COMMIT");
    return { discount, couponId: coupon.id, redeemed: upd[0].redeemed };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ───────────────────────── Shipping / freight ─────────────────────────────────
async function createShippingRule(tenantId, s) {
  if (!s || !s.name) throw new PostError("BAD_INPUT", "name required", 400);
  const basis = s.basis || "amount";                  // amount | weight | qty
  if (!["amount", "weight", "qty"].includes(basis))
    throw new PostError("BAD_INPUT", "basis must be amount/weight/qty", 400);
  // slabs: [{ from, to?, charge }] — normalize money to strings.
  const slabs = (s.slabs || []).map((sl) => ({
    from: toDb(sl.from || 0),
    to: sl.to != null ? toDb(sl.to) : null,
    charge: toDb(sl.charge || 0),
  }));
  const { rows } = await pool.query(
    `INSERT INTO book_shipping_rules (tenant_id, name, basis, slabs, account_ledger_id, is_active)
     VALUES ($1,$2,$3,$4::jsonb,$5,COALESCE($6,true)) RETURNING *`,
    [tenantId, s.name, basis, JSON.stringify(slabs), s.accountLedgerId || null, s.isActive]
  );
  return rows[0];
}

// Pure: find the slab whose [from, to] window contains `basisValue` and return
// its charge (string). Open-ended top slab (to=null) catches everything above.
function matchSlab(slabs, basisValue) {
  const v = money(basisValue || 0);
  for (const sl of slabs || []) {
    const from = money(sl.from || 0);
    const to = sl.to != null ? money(sl.to) : null;
    if (!gt(from, v) && (to == null || !gt(v, to))) return toDb(sl.charge || 0);
  }
  return null;
}

// shippingCharge: match the slab in a stored rule and return the freight + ledger.
async function shippingCharge(tenantId, { ruleId, basisValue }) {
  if (!ruleId) throw new PostError("BAD_INPUT", "ruleId required", 400);
  const { rows } = await pool.query(
    "SELECT * FROM book_shipping_rules WHERE tenant_id=$1 AND id=$2",
    [tenantId, ruleId]
  );
  const rule = rows[0];
  if (!rule) throw new PostError("NOT_FOUND", "Shipping rule not found", 404);
  if (!rule.is_active) throw new PostError("SHIPPING_INACTIVE", "Shipping rule is inactive", 409);
  const charge = matchSlab(rule.slabs, basisValue);
  if (charge == null) throw new PostError("NO_SLAB", "No shipping slab matched basis value", 422);
  return { charge, accountLedgerId: rule.account_ledger_id, basis: rule.basis };
}

// ───────────────────────── Bulk price-list upsert ─────────────────────────────
// Bulk-set selling prices on a price list, reusing the inventory price-list +
// price-list-item upsert SQL (book_price_lists / book_price_list_items). Each row
// is { itemId|itemName, priceList?, price, currency? }: resolves (or creates) the
// named price list, resolves the item by id or name, then upserts the price as a
// decimal-backed string. Every row runs in its own try/catch so one bad row never
// aborts the batch. Single-create logic uses plain pool.query (no per-create
// transaction), so per-row is correct here. Returns { created, failed, errors }.
async function bulkUpsertPrices(tenantId, actorId, rows) {
  if (!Array.isArray(rows)) throw new PostError("BAD_INPUT", "rows[] required", 400);
  let created = 0, failed = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      if (r.price == null || String(r.price).trim() === "")
        throw new PostError("BAD_INPUT", "price required", 400);

      // Resolve (or create) the named price list — mirrors inventory.createPriceList.
      const plName = r.priceList || "Standard";
      const currency = r.currency || "INR";
      let pl = (await pool.query(
        "INSERT INTO book_price_lists(tenant_id,name,currency) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING RETURNING *",
        [tenantId, plName, currency]
      )).rows[0];
      if (!pl)
        pl = (await pool.query(
          "SELECT * FROM book_price_lists WHERE tenant_id=$1 AND name=$2",
          [tenantId, plName]
        )).rows[0];
      if (!pl) throw new PostError("NOT_FOUND", "Price list not found", 404);

      // Resolve the item by id or name (book_stock_items).
      let itemId = r.itemId || null;
      if (!itemId) {
        if (!r.itemName) throw new PostError("BAD_INPUT", "itemId or itemName required", 400);
        const ir = await pool.query(
          "SELECT id FROM book_stock_items WHERE tenant_id=$1 AND name=$2",
          [tenantId, r.itemName]
        );
        if (!ir.rows[0]) throw new PostError("NOT_FOUND", `Item not found: ${r.itemName}`, 404);
        itemId = ir.rows[0].id;
      }

      // Upsert the price — mirrors inventory.setPrice.
      await pool.query(
        "INSERT INTO book_price_list_items(tenant_id,price_list_id,item_id,price) VALUES($1,$2,$3,$4) ON CONFLICT(price_list_id,item_id) DO UPDATE SET price=EXCLUDED.price RETURNING *",
        [tenantId, pl.id, itemId, toDb(r.price)]
      );
      created++;
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, error: e && e.message ? e.message : String(e) });
    }
  }
  return { created, failed, errors };
}

module.exports = {
  createPricingRule, listPricingRules, deletePricingRule,
  bulkUpsertPrices,
  applyPricing,
  createCoupon, redeemCoupon,
  createShippingRule, shippingCharge,
  // pure helpers exported for testability
  ruleMatchesLine, pickWinningRule, effectiveRate, couponDiscount, matchSlab,
};
