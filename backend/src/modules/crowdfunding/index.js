"use strict";
// Rewards crowdfunding — data layer (Keep-it-All core). Tenant-scoped throughout.
// Money model: a paid pledge is an ADVANCE (LIABILITY), recognised as INCOME only on
// fulfilment. GL postings are best-effort + idempotent: if the tenant's chart of
// accounts isn't seeded they degrade (gl_voucher_id stays null) without breaking the
// campaign lifecycle. The LLM/Razorpay rails are capability-gated by the caller.
const { pool } = require("../../db");
const { postVoucher } = require("./../books/posting-engine");
const { signToken, verifyToken } = require("../books/portal");

class CrowdError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}

const n = (v) => (v == null ? 0 : Number(v));
const VALID_FULFILMENT_TYPES = ["keep_it_all", "all_or_nothing"];

// Public-safe projection of a campaign row.
const publicShape = (c) => ({
  id: c.id, name: c.name, description: c.description, hero_image_url: c.hero_image_url,
  target_amount: n(c.target_amount), raised_amount: n(c.raised_amount),
  status: c.status, deadline: c.deadline,
  days_left: c.deadline ? Math.max(0, Math.ceil((new Date(c.deadline) - Date.now()) / 86400000)) : null,
});

// ── Ledger helpers (best-effort; null when the chart of accounts isn't seeded) ─────
async function ledgerByName(tenantId, name) {
  const { rows } = await pool.query(
    "SELECT id FROM book_ledgers WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) AND is_active=true LIMIT 1",
    [tenantId, name]
  ).catch(() => ({ rows: [] }));
  return rows[0]?.id || null;
}
// Find-or-create the "Crowdfund Advances" LIABILITY ledger under Current Liabilities.
async function ensureAdvancesLedger(tenantId) {
  const existing = await ledgerByName(tenantId, "Crowdfund Advances");
  if (existing) return existing;
  const { rows: g } = await pool.query(
    "SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name='Current Liabilities' LIMIT 1", [tenantId]
  ).catch(() => ({ rows: [] }));
  if (!g[0]) return null; // books not seeded for this tenant → skip GL
  await pool.query(
    "INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,'Crowdfund Advances',$2) ON CONFLICT(tenant_id,name) DO NOTHING",
    [tenantId, g[0].id]
  );
  return ledgerByName(tenantId, "Crowdfund Advances");
}

// Pledge captured → Dr Undeposited Funds (ASSET) / Cr Crowdfund Advances (LIABILITY).
async function postPledgeReceipt(tenantId, actorId, backer) {
  try {
    const undep = await ledgerByName(tenantId, "Undeposited Funds");
    const adv = await ensureAdvancesLedger(tenantId);
    if (!undep || !adv) return null; // chart of accounts not seeded → degrade
    const res = await postVoucher(
      tenantId, actorId || null,
      { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Crowdfund pledge ${backer.id}`, source: "crowdfunding" },
      [{ ledgerId: undep, debit: n(backer.amount), credit: 0 }, { ledgerId: adv, debit: 0, credit: n(backer.amount) }],
      { idempotencyKey: `crowd_pledge_${backer.payment_ref || backer.id}` }
    );
    return res.voucherId || null;
  } catch (e) { console.warn("[crowdfunding] pledge GL skipped:", e.message); return null; }
}

// Fulfilment → reclass advance to revenue: Dr Crowdfund Advances / Cr Sales (INCOME).
async function postFulfilmentRevenue(tenantId, actorId, backer) {
  try {
    const adv = await ledgerByName(tenantId, "Crowdfund Advances");
    const sales = await ledgerByName(tenantId, "Sales");
    if (!adv || !sales) return null;
    const res = await postVoucher(
      tenantId, actorId || null,
      { voucherType: "JOURNAL", voucherDate: new Date().toISOString().slice(0, 10), narration: `Crowdfund fulfilment ${backer.id}`, source: "crowdfunding" },
      [{ ledgerId: adv, debit: n(backer.amount), credit: 0 }, { ledgerId: sales, debit: 0, credit: n(backer.amount) }],
      { idempotencyKey: `crowd_fulfil_${backer.id}` }
    );
    return res.voucherId || null;
  } catch (e) { console.warn("[crowdfunding] fulfilment GL skipped:", e.message); return null; }
}

// ── Campaigns ──────────────────────────────────────────────────────────────────
async function createCampaign(tenantId, userId, body = {}) {
  const name = String(body.name || "").trim();
  if (!name) throw new CrowdError("BAD_INPUT", "name is required", 400);
  const ft = VALID_FULFILMENT_TYPES.includes(body.fulfillment_type) ? body.fulfillment_type : "keep_it_all";
  const { rows } = await pool.query(
    `INSERT INTO crowd_campaigns(tenant_id,name,slug,description,hero_image_url,target_amount,fulfillment_type,deadline,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, name, body.slug || null, body.description || null, body.hero_image_url || null,
     n(body.target_amount), ft, body.deadline || null, userId || null]
  );
  return rows[0];
}

async function listCampaigns(tenantId, { limit = 50, before } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const args = [tenantId]; let where = "tenant_id=$1";
  if (before) { args.push(before); where += ` AND id < $${args.length}`; }
  args.push(lim);
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM crowd_backers b WHERE b.campaign_id=c.id AND b.status='paid') AS backers_paid
     FROM crowd_campaigns c WHERE ${where} ORDER BY c.id DESC LIMIT $${args.length}`, args
  );
  return rows.map((r) => ({ ...r, target_amount: n(r.target_amount), raised_amount: n(r.raised_amount), backers_paid: Number(r.backers_paid) }));
}

async function getCampaign(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM crowd_campaigns WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new CrowdError("NOT_FOUND", "Campaign not found", 404);
  const perks = await listPerks(tenantId, id);
  const c = rows[0];
  return { ...c, target_amount: n(c.target_amount), raised_amount: n(c.raised_amount), perks };
}

async function updateCampaign(tenantId, id, body = {}) {
  const fields = []; const args = [tenantId, id]; let i = 2;
  for (const k of ["name", "description", "hero_image_url", "target_amount", "deadline", "slug"]) {
    if (body[k] !== undefined) { fields.push(`${k}=$${++i}`); args.push(k === "target_amount" ? n(body[k]) : body[k]); }
  }
  if (!fields.length) return getCampaign(tenantId, id);
  fields.push("updated_at=now()");
  const { rows } = await pool.query(`UPDATE crowd_campaigns SET ${fields.join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, args);
  if (!rows[0]) throw new CrowdError("NOT_FOUND", "Campaign not found", 404);
  return rows[0];
}

// State transition helper: assert current status ∈ from[], then set to.
async function transition(tenantId, id, fromStates, to, extraSql = "", extraArgs = []) {
  const { rows } = await pool.query(
    `UPDATE crowd_campaigns SET status=$3, updated_at=now()${extraSql ? "," + extraSql : ""}
     WHERE tenant_id=$1 AND id=$2 AND status = ANY($4) RETURNING *`,
    [tenantId, id, to, fromStates, ...extraArgs]
  );
  if (!rows[0]) {
    const cur = await pool.query("SELECT status FROM crowd_campaigns WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
    if (!cur.rows[0]) throw new CrowdError("NOT_FOUND", "Campaign not found", 404);
    throw new CrowdError("BAD_STATE", `Cannot move to "${to}" from "${cur.rows[0].status}"`, 409);
  }
  return rows[0];
}

const submitForReview = (t, id) => transition(t, id, ["draft", "rejected"], "pending_review");
const vetCampaign = (t, id, approve, note) =>
  transition(t, id, ["pending_review", "draft"], approve ? "approved" : "rejected");

// Publish → active (or 'preview' when payments aren't configured). Mints the public token.
async function publishCampaign(tenantId, id, { paymentsConfigured = false } = {}) {
  const to = paymentsConfigured ? "active" : "preview";
  const token = signToken({ k: "campaign", campaign_id: id, tenant_id: tenantId });
  return transition(tenantId, id, ["approved", "draft", "preview"], to, "public_token=$5, started_at=COALESCE(started_at, now())", [token]);
}

// Close (deadline reached or manual). KiA → funded immediately (funds already captured).
async function closeCampaign(tenantId, id) {
  const c = await getCampaign(tenantId, id);
  if (!["active", "preview", "closed_pending_settlement"].includes(c.status))
    throw new CrowdError("BAD_STATE", `Cannot close from "${c.status}"`, 409);
  if (c.fulfillment_type === "keep_it_all" || n(c.raised_amount) >= n(c.target_amount))
    return transition(tenantId, id, [c.status], "funded");
  // all_or_nothing + under target → refunding (refund execution is credential-gated)
  return transition(tenantId, id, [c.status], "refunding");
}

// ── Perks ────────────────────────────────────────────────────────────────────
async function addPerk(tenantId, campaignId, body = {}) {
  await getCampaign(tenantId, campaignId); // tenant + existence guard
  const name = String(body.name || "").trim();
  if (!name) throw new CrowdError("BAD_INPUT", "perk name required", 400);
  const { rows } = await pool.query(
    `INSERT INTO crowd_perks(campaign_id,tenant_id,name,description,unit_price,quantity_limit,stock_item_id,delivery_date,image_url)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [campaignId, tenantId, name, body.description || null, n(body.unit_price), body.quantity_limit ?? null,
     body.stock_item_id || null, body.delivery_date || null, body.image_url || null]
  );
  return rows[0];
}
async function listPerks(tenantId, campaignId) {
  const { rows } = await pool.query("SELECT * FROM crowd_perks WHERE tenant_id=$1 AND campaign_id=$2 ORDER BY unit_price ASC", [tenantId, campaignId]);
  return rows.map((r) => ({ ...r, unit_price: n(r.unit_price) }));
}
async function deletePerk(tenantId, campaignId, perkId) {
  const { rowCount } = await pool.query("DELETE FROM crowd_perks WHERE tenant_id=$1 AND campaign_id=$2 AND id=$3", [tenantId, campaignId, perkId]);
  if (!rowCount) throw new CrowdError("NOT_FOUND", "Perk not found", 404);
  return { deleted: true };
}

// ── Backers / pledges ────────────────────────────────────────────────────────
// Public pledge: validates the campaign is live + the amount against the perk, creates
// a pledged backer. Payment-link creation is the caller's job (capability-gated).
async function recordPledge(tenantId, campaignId, body = {}) {
  const c = await getCampaign(tenantId, campaignId);
  if (!["active", "preview"].includes(c.status)) throw new CrowdError("NOT_LIVE", "Campaign is not accepting pledges", 409);
  let amount = n(body.amount);
  let perk = null;
  if (body.perk_id) {
    perk = (c.perks || []).find((p) => p.id === body.perk_id);
    if (!perk) throw new CrowdError("BAD_INPUT", "Unknown perk for this campaign", 400);
    if (perk.quantity_limit != null && perk.quantity_sold >= perk.quantity_limit) throw new CrowdError("SOLD_OUT", "This perk is sold out", 409);
    if (amount < perk.unit_price) amount = perk.unit_price; // never below the tier price
  }
  if (!(amount > 0)) throw new CrowdError("BAD_INPUT", "amount must be > 0", 400);
  const { rows } = await pool.query(
    `INSERT INTO crowd_backers(campaign_id,perk_id,tenant_id,backer_name,backer_email,backer_phone,amount,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'pledged') RETURNING *`,
    [campaignId, body.perk_id || null, tenantId, body.backer_name || null, body.backer_email || null, body.backer_phone || null, amount]
  );
  return rows[0];
}

// Mark a pledge paid — idempotent (the WHERE status<>'paid' guard + unique payment_ref
// index make webhook retries safe). Increments raised_amount + perk sold, posts the
// liability RECEIPT to the GL (best-effort).
async function markPledgePaid(tenantId, { backerId, paymentRef, actorId } = {}) {
  if (!backerId) throw new CrowdError("BAD_INPUT", "backerId required", 400);
  let updated;
  try {
    const { rows } = await pool.query(
      `UPDATE crowd_backers SET status='paid', paid_at=now(), payment_ref=COALESCE($3, payment_ref)
       WHERE tenant_id=$1 AND id=$2 AND status<>'paid' RETURNING *`,
      [tenantId, backerId, paymentRef || null]
    );
    updated = rows[0];
  } catch (e) {
    if (e.code === "23505") return { alreadyPaid: true }; // duplicate payment_ref → already processed
    throw e;
  }
  if (!updated) return { alreadyPaid: true }; // not found or already paid → idempotent no-op
  await pool.query("UPDATE crowd_campaigns SET raised_amount = raised_amount + $3, updated_at=now() WHERE tenant_id=$1 AND id=$2",
    [tenantId, updated.campaign_id, n(updated.amount)]);
  if (updated.perk_id) await pool.query("UPDATE crowd_perks SET quantity_sold = quantity_sold + 1 WHERE id=$1 AND tenant_id=$2", [updated.perk_id, tenantId]);
  const voucherId = await postPledgeReceipt(tenantId, actorId, updated);
  if (voucherId) await pool.query("UPDATE crowd_backers SET gl_voucher_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, updated.id, voucherId]);
  return { paid: true, backerId: updated.id, glPosted: !!voucherId };
}

async function listBackers(tenantId, campaignId, { status, fulfillment } = {}) {
  const args = [tenantId, campaignId]; let where = "tenant_id=$1 AND campaign_id=$2";
  if (status) { args.push(status); where += ` AND status=$${args.length}`; }
  if (fulfillment) { args.push(fulfillment); where += ` AND fulfillment_status=$${args.length}`; }
  const { rows } = await pool.query(`SELECT * FROM crowd_backers WHERE ${where} ORDER BY created_at DESC`, args);
  return rows.map((r) => ({ ...r, amount: n(r.amount) }));
}

async function updateFulfilment(tenantId, campaignId, backerId, { status, tracking, actorId } = {}) {
  const allowed = ["pending", "packed", "shipped", "delivered", "failed"];
  if (!allowed.includes(status)) throw new CrowdError("BAD_INPUT", `status must be one of ${allowed.join(", ")}`, 400);
  const { rows } = await pool.query(
    `UPDATE crowd_backers SET fulfillment_status=$4, tracking=COALESCE($5, tracking)
     WHERE tenant_id=$1 AND campaign_id=$2 AND id=$3 RETURNING *`,
    [tenantId, campaignId, backerId, status, tracking || null]
  );
  if (!rows[0]) throw new CrowdError("NOT_FOUND", "Backer not found", 404);
  const b = rows[0];
  // Recognise revenue when delivered (only for a paid pledge that hasn't been recognised).
  if (status === "delivered" && b.status === "paid") {
    const v = await postFulfilmentRevenue(tenantId, actorId, b);
    if (v) await pool.query("UPDATE crowd_backers SET fulfillment_status='delivered' WHERE id=$1", [b.id]);
  }
  return { ...b, amount: n(b.amount) };
}

async function analytics(tenantId, campaignId) {
  const c = await getCampaign(tenantId, campaignId);
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amount),0) AS total FROM crowd_backers
     WHERE tenant_id=$1 AND campaign_id=$2 GROUP BY status`, [tenantId, campaignId]
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, { count: r.cnt, total: n(r.total) }]));
  const pledged = (by.pledged?.count || 0) + (by.paid?.count || 0);
  return {
    target: n(c.target_amount), raised: n(c.raised_amount),
    progress_pct: c.target_amount > 0 ? Math.round((n(c.raised_amount) / n(c.target_amount)) * 100) : 0,
    backers_paid: by.paid?.count || 0,
    conversion_pct: pledged > 0 ? Math.round(((by.paid?.count || 0) / pledged) * 100) : 0,
    by_status: by, days_left: publicShape(c).days_left,
  };
}

// ── Public (token-gated, no auth) ──────────────────────────────────────────────
function decodeCampaignToken(token) {
  const p = verifyToken(token);
  if (!p || p.k !== "campaign" || !p.campaign_id || !p.tenant_id) throw new CrowdError("BAD_TOKEN", "Invalid or expired campaign link", 401);
  return p;
}
async function publicCampaign(token) {
  const { campaign_id, tenant_id } = decodeCampaignToken(token);
  const { rows } = await pool.query("SELECT * FROM crowd_campaigns WHERE tenant_id=$1 AND id=$2", [tenant_id, campaign_id]);
  if (!rows[0]) throw new CrowdError("NOT_FOUND", "Campaign not found", 404);
  const perks = await listPerks(tenant_id, campaign_id);
  return { ...publicShape(rows[0]), perks: perks.map((p) => ({ id: p.id, name: p.name, description: p.description, unit_price: p.unit_price, delivery_date: p.delivery_date, sold_out: p.quantity_limit != null && p.quantity_sold >= p.quantity_limit })) };
}
async function publicPledge(token, body) {
  const { campaign_id, tenant_id } = decodeCampaignToken(token);
  const backer = await recordPledge(tenant_id, campaign_id, body);
  return { backerId: backer.id, amount: n(backer.amount), status: backer.status, tenantId: tenant_id, campaignId: campaign_id };
}
async function setBackerPayUrl(tenantId, backerId, payUrl) {
  await pool.query("UPDATE crowd_backers SET pay_url=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, backerId, payUrl]);
}

module.exports = {
  CrowdError,
  createCampaign, listCampaigns, getCampaign, updateCampaign,
  submitForReview, vetCampaign, publishCampaign, closeCampaign,
  addPerk, listPerks, deletePerk,
  recordPledge, markPledgePaid, listBackers, updateFulfilment, analytics,
  publicCampaign, publicPledge, setBackerPayUrl, decodeCampaignToken,
  postPledgeReceipt, postFulfilmentRevenue, // exported for the seeded-tenant GL test
};
