// CRM module — leads → deals (pipeline) → won, integrated with the books ledger
// (a won deal creates a Sundry-Debtors customer ledger). Tenant-scoped; reuses
// Headroom auth. Money kept simple (NUMERIC(19,2)); the ledger is the source of truth.
const { pool } = require("../../db");

const STAGES = ["QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const STAGE_PROB = { QUALIFIED: 20, PROPOSAL: 50, NEGOTIATION: 75, WON: 100, LOST: 0 };
const stageProbability = (stage) => (STAGE_PROB[stage] ?? 0);
// Pipeline expected value = Σ open-deal value × probability.
function weightedValue(deals) {
  return deals.filter((d) => d.status === "OPEN").reduce((s, d) => s + Number(d.value || 0) * (Number(d.probability || 0) / 100), 0);
}

class CrmError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// ── Accounts / contacts ──────────────────────────────────────────────────────
async function createAccount(tenantId, actorId, a) {
  if (!a.name) throw new CrmError("name required");
  const { rows } = await pool.query(
    "INSERT INTO crm_accounts(tenant_id,name,industry,website,phone,gstin,owner_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,name) DO UPDATE SET industry=COALESCE(EXCLUDED.industry,crm_accounts.industry) RETURNING *",
    [tenantId, a.name, a.industry || null, a.website || null, a.phone || null, a.gstin || null, actorId || null]
  );
  return rows[0];
}
const listAccounts = async (t) => (await pool.query("SELECT * FROM crm_accounts WHERE tenant_id=$1 ORDER BY name", [t])).rows;
async function createContact(tenantId, c) {
  if (!c.name) throw new CrmError("name required");
  const { rows } = await pool.query("INSERT INTO crm_contacts(tenant_id,account_id,name,email,phone,designation) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [tenantId, c.accountId || null, c.name, c.email || null, c.phone || null, c.designation || null]);
  return rows[0];
}
const listContacts = async (t) => (await pool.query("SELECT * FROM crm_contacts WHERE tenant_id=$1 ORDER BY name", [t])).rows;

// ── Leads ────────────────────────────────────────────────────────────────────
async function createLead(tenantId, actorId, l) {
  if (!l.name) throw new CrmError("name required");
  const { rows } = await pool.query("INSERT INTO crm_leads(tenant_id,name,company,email,phone,source,owner_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [tenantId, l.name, l.company || null, l.email || null, l.phone || null, l.source || null, actorId || null]);
  return rows[0];
}
const listLeads = async (t) => (await pool.query("SELECT * FROM crm_leads WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;
async function setLeadStatus(tenantId, leadId, status) {
  const { rows } = await pool.query("UPDATE crm_leads SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, leadId, status]);
  if (!rows[0]) throw new CrmError("Lead not found", 404);
  return rows[0];
}
// Lead → account + contact + an open deal; marks the lead CONVERTED.
async function convertLead(tenantId, actorId, leadId) {
  const { rows: lr } = await pool.query("SELECT * FROM crm_leads WHERE tenant_id=$1 AND id=$2", [tenantId, leadId]);
  const lead = lr[0];
  if (!lead) throw new CrmError("Lead not found", 404);
  if (lead.status === "CONVERTED") throw new CrmError("Lead already converted", 409);
  const account = await createAccount(tenantId, actorId, { name: lead.company || lead.name, phone: lead.phone });
  const contact = await createContact(tenantId, { accountId: account.id, name: lead.name, email: lead.email, phone: lead.phone });
  const deal = await createDeal(tenantId, actorId, { title: `${lead.company || lead.name} — opportunity`, accountId: account.id, contactId: contact.id, value: 0, stage: "QUALIFIED" });
  await pool.query("UPDATE crm_leads SET status='CONVERTED', converted_deal_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, leadId, deal.id]);
  return { account, contact, deal };
}

// ── Deals / pipeline ─────────────────────────────────────────────────────────
async function createDeal(tenantId, actorId, d) {
  if (!d.title) throw new CrmError("title required");
  const stage = STAGES.includes(d.stage) ? d.stage : "QUALIFIED";
  const { rows } = await pool.query(
    "INSERT INTO crm_deals(tenant_id,title,account_id,contact_id,value,stage,probability,expected_close,owner_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [tenantId, d.title, d.accountId || null, d.contactId || null, d.value || 0, stage, d.probability != null ? d.probability : stageProbability(stage), d.expectedClose || null, actorId || null]
  );
  return rows[0];
}
const listDeals = async (t) => (await pool.query("SELECT * FROM crm_deals WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;
async function moveStage(tenantId, dealId, stage) {
  if (!STAGES.includes(stage)) throw new CrmError("Invalid stage");
  const status = stage === "WON" ? "WON" : stage === "LOST" ? "LOST" : "OPEN";
  const closed = status === "OPEN" ? null : new Date().toISOString();
  const { rows } = await pool.query("UPDATE crm_deals SET stage=$3, probability=$4, status=$5, closed_at=$6 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, dealId, stage, stageProbability(stage), status, closed]);
  if (!rows[0]) throw new CrmError("Deal not found", 404);
  return rows[0];
}
// Win → mark WON + create/link a Sundry-Debtors customer ledger in the books.
async function winDeal(tenantId, dealId) {
  const deal = await moveStage(tenantId, dealId, "WON");
  if (deal.account_id) {
    const { rows: ar } = await pool.query("SELECT * FROM crm_accounts WHERE id=$1", [deal.account_id]);
    const acct = ar[0];
    if (acct && !acct.books_ledger_id) {
      const { rows: g } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name='Sundry Debtors'", [tenantId]);
      if (g[0]) {
        const { rows: lg } = await pool.query(
          "INSERT INTO book_ledgers(tenant_id,name,group_id,is_party,gstin) VALUES($1,$2,$3,true,$4) ON CONFLICT(tenant_id,name) DO UPDATE SET is_party=true RETURNING id",
          [tenantId, acct.name, g[0].id, acct.gstin || null]
        );
        await pool.query("UPDATE crm_accounts SET books_ledger_id=$2 WHERE id=$1", [acct.id, lg[0].id]);
        return { ...deal, booksLedgerId: lg[0].id, customerCreated: true };
      }
    }
  }
  return deal;
}
async function pipeline(tenantId) {
  const deals = await listDeals(tenantId);
  const open = deals.filter((d) => d.status === "OPEN");
  const byStage = {};
  for (const s of ["QUALIFIED", "PROPOSAL", "NEGOTIATION"]) {
    const ds = open.filter((d) => d.stage === s);
    byStage[s] = { count: ds.length, value: ds.reduce((x, d) => x + Number(d.value || 0), 0), deals: ds };
  }
  const won = deals.filter((d) => d.status === "WON");
  return {
    stages: byStage,
    weightedValue: Math.round(weightedValue(open)),
    openCount: open.length,
    wonCount: won.length,
    wonValue: won.reduce((x, d) => x + Number(d.value || 0), 0),
  };
}

// ── Activities ───────────────────────────────────────────────────────────────
async function logActivity(tenantId, actorId, a) {
  const { rows } = await pool.query("INSERT INTO crm_activities(tenant_id,kind,subject,body,deal_id,lead_id,account_id,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [tenantId, a.kind || "NOTE", a.subject || null, a.body || null, a.dealId || null, a.leadId || null, a.accountId || null, a.dueDate || null, actorId || null]);
  return rows[0];
}
async function listActivities(tenantId, filter = {}) {
  const params = [tenantId]; const where = ["tenant_id=$1"];
  if (filter.dealId) { params.push(filter.dealId); where.push(`deal_id=$${params.length}`); }
  const { rows } = await pool.query(`SELECT * FROM crm_activities WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 500`, params);
  return rows;
}
async function completeActivity(tenantId, id) { await pool.query("UPDATE crm_activities SET done=true WHERE tenant_id=$1 AND id=$2", [tenantId, id]); return { ok: true }; }

module.exports = {
  STAGES, stageProbability, weightedValue, CrmError,
  createAccount, listAccounts, createContact, listContacts,
  createLead, listLeads, setLeadStatus, convertLead,
  createDeal, listDeals, moveStage, winDeal, pipeline,
  logActivity, listActivities, completeActivity,
};
