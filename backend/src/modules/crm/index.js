// CRM module — leads → deals (pipeline) → won, with SLAs, tasks, notes and a unified
// activity timeline. Domain logic ported from Frappe CRM (fcrm):
//
//   • SLA            — crm_service_level_agreement.py : apply(), calc_time() business-hours
//                       walk, set_response_by(), handle_communication_status()/first response,
//                       handle_sla_status() WITHIN/BREACHED.
//   • Lead → Deal    — crm_lead.py : convert_to_deal(), create_contact/create_organization/
//                       create_deal() faithful field mapping; marks lead Qualified+converted.
//   • Deal pipeline  — crm_deal.py / crm_deal_status.json : stage→probability, primary contact,
//                       lost reason, closed_date on Won.
//   • Tasks / Notes  — crm_task.py / fcrm_note.py.
//   • Status log     — crm_status_change_log.py : add_status_change_log + duration.
//
// A won deal still creates a Sundry-Debtors customer ledger in books. Tenant-scoped;
// money kept simple (NUMERIC(19,2)); the ledger is the source of truth.
const { pool } = require("../../db");

// ── Status vocabularies (ported from crm_lead_status / crm_deal_status fixtures) ─────
// Lead statuses (type drives workflow): New/Contacted/Nurture = Open, Qualified = Ongoing,
// Unqualified = Lost, Junk = Lost. CONVERTED is our terminal marker (Frappe uses a
// `converted` flag + status="Qualified"; we keep an explicit CONVERTED status too).
const LEAD_STATUSES = {
  NEW: { type: "Open", label: "New" },
  CONTACTED: { type: "Open", label: "Contacted" },
  NURTURE: { type: "Open", label: "Nurture" },
  QUALIFIED: { type: "Ongoing", label: "Qualified" },
  UNQUALIFIED: { type: "Lost", label: "Unqualified" },
  JUNK: { type: "Lost", label: "Junk" },
  CONVERTED: { type: "Converted", label: "Converted" },
};

// Deal statuses → stage→probability (ported from crm_deal_status.json `probability`).
// `type` mirrors Frappe: Open/Ongoing/Won/Lost; status === stage in our model.
const DEAL_STATUSES = {
  QUALIFICATION: { type: "Open", probability: 20, label: "Qualification" },
  DEMO: { type: "Ongoing", probability: 40, label: "Demo / Making" },
  PROPOSAL: { type: "Ongoing", probability: 60, label: "Proposal / Quotation" },
  NEGOTIATION: { type: "Ongoing", probability: 80, label: "Negotiation" },
  WON: { type: "Won", probability: 100, label: "Won" },
  LOST: { type: "Lost", probability: 0, label: "Lost" },
};
const STAGES = Object.keys(DEAL_STATUSES);
// open (board) stages, ordered — used for forward/back movement + pipeline buckets.
const OPEN_STAGES = ["QUALIFICATION", "DEMO", "PROPOSAL", "NEGOTIATION"];
const stageProbability = (stage) => (DEAL_STATUSES[stage] ? DEAL_STATUSES[stage].probability : 0);
const dealStatusType = (stage) => (DEAL_STATUSES[stage] ? DEAL_STATUSES[stage].type : "Open");

// Pipeline expected value = Σ open-deal value × probability.
function weightedValue(deals) {
  return deals
    .filter((d) => d.status === "OPEN")
    .reduce((s, d) => s + Number(d.value || 0) * (Number(d.probability || 0) / 100), 0);
}

class CrmError extends Error {
  constructor(msg, http) { super(msg); this.http = http || 400; }
}

// ════════════════════════════════════════════════════════════════════════════════════
// SLA ENGINE  (port of crm_service_level_agreement.py — pure, unit-testable)
// ════════════════════════════════════════════════════════════════════════════════════
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 86400000;

// "HH:MM" → seconds-since-midnight. Faithful to CRMServiceDay start_time/end_time.
function hhmmToSecs(s) {
  if (!s) return 0;
  const [h, m] = String(s).split(":").map((x) => parseInt(x, 10) || 0);
  return h * 3600 + m * 60;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isHoliday = (date, holidays) => holidays.includes(ymd(date));
const secsSinceMidnight = (d) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

// Default 9–6 Mon–Fri working hours (used when an SLA omits working_hours).
function defaultWorkingHours() {
  const wh = {};
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    wh[day] = { start: "09:00", end: "18:00" };
  }
  return wh;
}

// Port of CRMServiceLevelAgreement.calc_time(): walk forward from `start` consuming
// `durationSecs` of *working* time only (skipping non-workdays, holidays, and
// out-of-hours). Returns the deadline Date.
function calcTime(start, durationSecs, workingHours, holidays) {
  let res = new Date(start.getTime());
  let timeNeeded = Math.max(0, Math.floor(durationSecs));
  let guard = 0; // safety: at most ~5y of day-steps
  while (timeNeeded > 0 && guard < 2000) {
    guard++;
    const weekday = WEEKDAYS[res.getDay()];
    const workday = workingHours[weekday];
    if (!workday || isHoliday(res, holidays)) {
      // advance to start of next day
      res = new Date(res.getTime() + DAY_MS);
      res.setHours(0, 0, 0, 0);
      continue;
    }
    const nowInSecs = secsSinceMidnight(res);
    const startSecs = hhmmToSecs(workday.start);
    const endSecs = hhmmToSecs(workday.end);
    const effStart = Math.max(startSecs, nowInSecs);
    const tillStart = Math.max(effStart - nowInSecs, 0);
    const effEnd = Math.max(endSecs, nowInSecs);
    const timeLeft = Math.max(effEnd - effStart, 0);
    if (timeLeft <= 0) {
      // past end-of-day → jump to next day start
      res = new Date(res.getTime() + DAY_MS);
      res.setHours(0, 0, 0, 0);
      continue;
    }
    const timeTaken = Math.min(timeNeeded, timeLeft);
    timeNeeded -= timeTaken;
    res = new Date(res.getTime() + (tillStart + timeTaken) * 1000);
  }
  return res;
}

// Port of calc_elapsed_time(): elapsed *working* seconds between two instants. Walks in
// minute steps for performance (Frappe walks per-second; minute granularity is plenty
// for response-time reporting and avoids a multi-million-iteration loop).
function calcElapsedTime(start, end, workingHours, holidays) {
  let cur = new Date(start.getTime());
  const stop = new Date(end.getTime());
  let total = 0;
  const STEP = 60; // seconds
  let guard = 0;
  while (cur < stop && guard < 2_000_000) {
    guard++;
    const weekday = WEEKDAYS[cur.getDay()];
    const workday = workingHours[weekday];
    if (workday && !isHoliday(cur, holidays)) {
      const s = secsSinceMidnight(cur);
      if (s >= hhmmToSecs(workday.start) && s < hhmmToSecs(workday.end)) total += STEP;
    }
    cur = new Date(cur.getTime() + STEP * 1000);
  }
  return total;
}

// Normalize an SLA row's JSON config into a usable shape.
function slaConfig(sla) {
  const priorities = Array.isArray(sla.priorities) ? sla.priorities : [];
  let wh = sla.working_hours && Object.keys(sla.working_hours).length ? sla.working_hours : defaultWorkingHours();
  const holidays = Array.isArray(sla.holidays) ? sla.holidays : [];
  return { priorities, workingHours: wh, holidays };
}
function defaultPriority(priorities) {
  const def = priorities.find((p) => p.default_priority);
  return (def || priorities[0] || {}).priority || null;
}
function priorityRow(priorities, priority) {
  return priorities.find((p) => p.priority === priority) || null;
}

// Port of CRMServiceLevelAgreement.apply() + set_response_by/handle_sla_status.
// Given a doc-like { sla_creation, priority, first_response_at }, compute the SLA
// timestamps + status. Pure function → returns the fields to persist.
//
//   response_by   = calc_time(creation, first_response_time h)
//   resolution_by = calc_time(creation, resolution_time h)
//   sla_status    = Fulfilled if first response landed in time
//                   Failed    if no response and response_by passed, or response was late
//                   First Response Due otherwise
//   escalated     = overdue (now > resolution_by) and unresolved
function computeSla(sla, doc, now = new Date()) {
  const cfg = slaConfig(sla);
  const slaCreation = doc.sla_creation ? new Date(doc.sla_creation) : now;
  const priority = doc.priority || defaultPriority(cfg.priorities);
  const prow = priorityRow(cfg.priorities, priority);
  const out = {
    sla_id: sla.id,
    sla_creation: slaCreation.toISOString(),
    priority,
    response_by: null,
    resolution_by: null,
    first_response_at: doc.first_response_at || null,
    sla_status: null,
    escalated: false,
  };
  if (!prow) {
    out.sla_status = "First Response Due";
    return out;
  }
  // durations stored in hours → seconds
  const responseSecs = (Number(prow.response_time) || 0) * 3600;
  const resolutionSecs = (Number(prow.resolution_time) || Number(prow.response_time) || 0) * 3600;
  const responseBy = calcTime(slaCreation, responseSecs, cfg.workingHours, cfg.holidays);
  const resolutionBy = calcTime(slaCreation, resolutionSecs, cfg.workingHours, cfg.holidays);
  out.response_by = responseBy.toISOString();
  out.resolution_by = resolutionBy.toISOString();

  // first-response status (port of is_first_response_failed + handle_sla_status)
  const firstResp = doc.first_response_at ? new Date(doc.first_response_at) : null;
  let failed;
  if (!firstResp) failed = responseBy < now;
  else failed = responseBy < firstResp;

  if (failed) out.sla_status = "Failed";
  else if (!firstResp) out.sla_status = "First Response Due";
  else out.sla_status = "Fulfilled";

  // escalation: still unresolved and resolution deadline passed
  out.escalated = !firstResp && resolutionBy < now;
  return out;
}

// Find the applicable SLA for a lead/deal (port of utils.get_sla): enabled, apply_on
// matches, within validity window, prefer one whose priorities include the doc priority,
// default last.
async function findSla(tenantId, applyOn, priority) {
  const { rows } = await pool.query(
    `SELECT * FROM crm_slas
       WHERE tenant_id=$1 AND apply_on=$2 AND enabled=true
         AND (start_date IS NULL OR start_date <= now())
         AND (end_date   IS NULL OR end_date   >= now())
       ORDER BY is_default ASC, created_at ASC`,
    [tenantId, applyOn]
  );
  if (!rows.length) return null;
  if (priority) {
    const match = rows.find((s) => priorityRow(Array.isArray(s.priorities) ? s.priorities : [], priority));
    if (match) return match;
  }
  return rows[0];
}

// ── SLA config CRUD ────────────────────────────────────────────────────────────────
async function createSla(tenantId, s) {
  if (!s.name) throw new CrmError("name required");
  const applyOn = s.applyOn === "Deal" ? "Deal" : "Lead";
  const priorities = Array.isArray(s.priorities) ? s.priorities : [];
  if (!priorities.length) throw new CrmError("at least one priority required");
  for (const p of priorities) {
    if (!p.priority || p.response_time == null) throw new CrmError("each priority needs { priority, response_time }");
  }
  const workingHours = s.workingHours && Object.keys(s.workingHours).length ? s.workingHours : defaultWorkingHours();
  const holidays = Array.isArray(s.holidays) ? s.holidays : [];
  const { rows } = await pool.query(
    `INSERT INTO crm_slas(tenant_id,name,apply_on,enabled,is_default,priorities,working_hours,holidays,start_date,end_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(tenant_id,name) DO UPDATE SET apply_on=EXCLUDED.apply_on, enabled=EXCLUDED.enabled,
         is_default=EXCLUDED.is_default, priorities=EXCLUDED.priorities, working_hours=EXCLUDED.working_hours,
         holidays=EXCLUDED.holidays, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date
       RETURNING *`,
    [tenantId, s.name, applyOn, s.enabled !== false, !!s.isDefault, JSON.stringify(priorities),
     JSON.stringify(workingHours), JSON.stringify(holidays), s.startDate || null, s.endDate || null]
  );
  return rows[0];
}
const listSlas = async (t) => (await pool.query("SELECT * FROM crm_slas WHERE tenant_id=$1 ORDER BY apply_on, name", [t])).rows;

// ════════════════════════════════════════════════════════════════════════════════════
// LEAD SCORING  (simple rules-based, computed from filled fields/qualification)
// ════════════════════════════════════════════════════════════════════════════════════
function computeLeadScore(lead) {
  let score = 0;
  if (lead.email) score += 15;
  if (lead.phone) score += 15;
  if (lead.company) score += 15;
  if (lead.job_title) score += 10;
  if (lead.website) score += 5;
  if (lead.industry) score += 5;
  if (lead.source) score += 5;
  const rev = Number(lead.annual_revenue || 0);
  if (rev >= 10000000) score += 20;       // ≥ 1 Cr
  else if (rev >= 1000000) score += 10;    // ≥ 10 L
  else if (rev > 0) score += 5;
  // qualification status lifts the score
  const st = (lead.status || "").toUpperCase();
  if (st === "QUALIFIED" || st === "CONVERTED") score += 15;
  else if (st === "CONTACTED" || st === "NURTURE") score += 5;
  return Math.min(100, score);
}

// ════════════════════════════════════════════════════════════════════════════════════
// STATUS CHANGE LOG  (port of crm_status_change_log.add_status_change_log)
// ════════════════════════════════════════════════════════════════════════════════════
async function logStatusChange(tenantId, refType, refId, fromStatus, toStatus, actorId, fromDate) {
  let duration = null;
  if (fromDate) duration = Math.max(0, Math.round((Date.now() - new Date(fromDate).getTime()) / 1000));
  await pool.query(
    "INSERT INTO crm_status_change_log(tenant_id,reference_type,reference_id,from_status,to_status,duration_secs,log_owner) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [tenantId, refType, refId, fromStatus || null, toStatus || null, duration, actorId || null]
  );
}

// ── Accounts / contacts ──────────────────────────────────────────────────────────────
async function createAccount(tenantId, actorId, a) {
  if (!a.name) throw new CrmError("name required");
  const { rows } = await pool.query(
    `INSERT INTO crm_accounts(tenant_id,name,industry,website,phone,gstin,annual_revenue,territory,owner_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(tenant_id,name) DO UPDATE SET industry=COALESCE(EXCLUDED.industry,crm_accounts.industry)
       RETURNING *`,
    [tenantId, a.name, a.industry || null, a.website || null, a.phone || null, a.gstin || null,
     a.annualRevenue != null ? a.annualRevenue : null, a.territory || null, actorId || null]
  );
  return rows[0];
}
const listAccounts = async (t) => (await pool.query("SELECT * FROM crm_accounts WHERE tenant_id=$1 ORDER BY name", [t])).rows;

// Faithful to lead.create_contact: split a single name into first/last when not given.
function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}
async function createContact(tenantId, c) {
  if (!c.name) throw new CrmError("name required");
  const { first, last } = c.firstName ? { first: c.firstName, last: c.lastName || "" } : splitName(c.name);
  const { rows } = await pool.query(
    `INSERT INTO crm_contacts(tenant_id,account_id,name,salutation,first_name,last_name,email,phone,mobile_no,designation,gender)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, c.accountId || null, c.name, c.salutation || null, first || null, last || null,
     c.email || null, c.phone || null, c.mobileNo || c.phone || null, c.designation || null, c.gender || null]
  );
  return rows[0];
}
const listContacts = async (t) => (await pool.query("SELECT * FROM crm_contacts WHERE tenant_id=$1 ORDER BY name", [t])).rows;

// Match an existing contact by email (port of lead.contact_exists — email uniquely
// identifies a person), then mobile.
async function findContact(tenantId, email, phone) {
  if (email) {
    const { rows } = await pool.query("SELECT * FROM crm_contacts WHERE tenant_id=$1 AND lower(email)=lower($2) LIMIT 1", [tenantId, email]);
    if (rows[0]) return rows[0];
  }
  if (phone) {
    const { rows } = await pool.query("SELECT * FROM crm_contacts WHERE tenant_id=$1 AND (phone=$2 OR mobile_no=$2) LIMIT 1", [tenantId, phone]);
    if (rows[0]) return rows[0];
  }
  return null;
}

// ── Leads ────────────────────────────────────────────────────────────────────────────
async function createLead(tenantId, actorId, l) {
  if (!l.name && !l.company && !l.email) {
    // port of set_lead_name: requires a person or an organization name
    throw new CrmError("A lead requires a name, company, or email");
  }
  const name = l.name || l.company || (l.email ? String(l.email).split("@")[0] : "Unnamed Lead");
  const status = LEAD_STATUSES[(l.status || "NEW").toUpperCase()] ? (l.status || "NEW").toUpperCase() : "NEW";
  const priority = l.priority || null;
  const draft = {
    email: l.email, phone: l.phone, company: l.company, job_title: l.jobTitle,
    website: l.website, industry: l.industry, source: l.source,
    annual_revenue: l.annualRevenue, status,
  };
  const score = computeLeadScore(draft);

  // SLA: find + apply on create (port of set_sla + apply_sla → handle_creation + targets).
  let sla = await findSla(tenantId, "Lead", priority);
  let slaFields = {};
  if (sla) slaFields = computeSla(sla, { sla_creation: new Date(), priority, first_response_at: null });

  const { rows } = await pool.query(
    `INSERT INTO crm_leads(tenant_id,name,company,email,phone,source,status,industry,territory,job_title,
        annual_revenue,no_of_employees,website,priority,score,owner_user_id,
        sla_id,sla_creation,response_by,resolution_by,sla_status,escalated)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
    [tenantId, name, l.company || null, l.email || null, l.phone || null, l.source || null, status,
     l.industry || null, l.territory || null, l.jobTitle || null, l.annualRevenue != null ? l.annualRevenue : null,
     l.noOfEmployees || null, l.website || null, priority, score, actorId || null,
     slaFields.sla_id || null, slaFields.sla_creation || null, slaFields.response_by || null,
     slaFields.resolution_by || null, slaFields.sla_status || null, !!slaFields.escalated]
  );
  return rows[0];
}
const listLeads = async (t) => (await pool.query("SELECT * FROM crm_leads WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;
async function getLead(tenantId, leadId) {
  const { rows } = await pool.query("SELECT * FROM crm_leads WHERE tenant_id=$1 AND id=$2", [tenantId, leadId]);
  if (!rows[0]) throw new CrmError("Lead not found", 404);
  return rows[0];
}

// Recompute the SLA snapshot for a lead/deal from its current row + an as-of time.
async function refreshLeadSla(tenantId, lead, now = new Date()) {
  if (!lead.sla_id) return lead;
  const { rows: sr } = await pool.query("SELECT * FROM crm_slas WHERE tenant_id=$1 AND id=$2", [tenantId, lead.sla_id]);
  if (!sr[0]) return lead;
  const f = computeSla(sr[0], { sla_creation: lead.sla_creation, priority: lead.priority, first_response_at: lead.first_response_at }, now);
  const { rows } = await pool.query(
    "UPDATE crm_leads SET response_by=$3,resolution_by=$4,sla_status=$5,escalated=$6 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, lead.id, f.response_by, f.resolution_by, f.sla_status, f.escalated]
  );
  return rows[0];
}

async function setLeadStatus(tenantId, actorId, leadId, status) {
  const key = (status || "").toUpperCase();
  if (!LEAD_STATUSES[key]) throw new CrmError("Invalid lead status");
  const lead = await getLead(tenantId, leadId);
  // lost-reason validation (port of validate_lost_reason)
  if (LEAD_STATUSES[key].type === "Lost" && !lead.lost_reason) {
    throw new CrmError("Please specify a reason for losing the lead");
  }
  if (lead.status !== key) {
    await logStatusChange(tenantId, "LEAD", leadId, lead.status, key, actorId, lead.created_at);
  }
  const score = computeLeadScore({ ...lead, status: key });
  const { rows } = await pool.query("UPDATE crm_leads SET status=$3, score=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, leadId, key, score]);
  return rows[0];
}

async function setLeadLostReason(tenantId, leadId, reason) {
  const { rows } = await pool.query("UPDATE crm_leads SET lost_reason=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, leadId, reason || null]);
  if (!rows[0]) throw new CrmError("Lead not found", 404);
  return rows[0];
}

// ── Lead → Deal conversion (port of crm_lead.convert_to_deal + create_*) ─────────────
// Faithful field mapping: lead → (find/create) organization account, (find/create)
// contact from name/email/phone, and a deal carrying value/source/owner + SLA snapshot.
async function convertLead(tenantId, actorId, leadId, opts = {}) {
  const lead = await getLead(tenantId, leadId);
  if (lead.status === "CONVERTED" || lead.converted_deal_id) throw new CrmError("Lead already converted", 409);

  // create_organization: find by name else create from lead.company
  let account = null;
  if (lead.company) {
    account = await createAccount(tenantId, actorId, {
      name: lead.company, phone: lead.phone, industry: lead.industry,
      website: lead.website, annualRevenue: lead.annual_revenue, territory: lead.territory,
    });
  }

  // create_contact: match existing by email/phone, else create from lead identity
  let contact = await findContact(tenantId, lead.email, lead.phone);
  if (!contact) {
    contact = await createContact(tenantId, {
      accountId: account ? account.id : null, name: lead.name,
      email: lead.email, phone: lead.phone, designation: lead.job_title,
    });
  } else if (account && !contact.account_id) {
    await pool.query("UPDATE crm_contacts SET account_id=$2 WHERE id=$1", [contact.id, account.id]);
    contact = { ...contact, account_id: account.id };
  }

  // create_deal: map value/source/owner; carry SLA snapshot (lead.first_responded_on → deal)
  const title = opts.title || `${lead.company || lead.name} — opportunity`;
  const deal = await createDeal(tenantId, actorId, {
    title,
    accountId: account ? account.id : null,
    contactId: contact ? contact.id : null,
    value: opts.value != null ? opts.value : 0,
    source: lead.source,
    priority: lead.priority,
    stage: "QUALIFICATION",
    leadId: lead.id,
    expectedClose: opts.expectedClose || null,
    // carry SLA tracking from the lead (Frappe copies sla_creation/response_by/etc.)
    _slaCarry: lead.sla_id
      ? {
          sla_id: lead.sla_id, sla_creation: lead.sla_creation, priority: lead.priority,
          response_by: lead.response_by, resolution_by: lead.resolution_by,
          first_response_at: lead.first_response_at, sla_status: lead.sla_status, escalated: lead.escalated,
        }
      : null,
  });

  // mark lead Qualified + converted (port: db_set status="Qualified", converted=1)
  await logStatusChange(tenantId, "LEAD", lead.id, lead.status, "CONVERTED", actorId, lead.created_at);
  const score = computeLeadScore({ ...lead, status: "CONVERTED" });
  const { rows: lr } = await pool.query(
    "UPDATE crm_leads SET status='CONVERTED', converted_deal_id=$3, score=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, leadId, deal.id, score]
  );
  await logActivity(tenantId, actorId, { kind: "NOTE", subject: "Lead converted to deal", dealId: deal.id, leadId: lead.id });
  return { lead: lr[0], account, contact, deal };
}

// ── Deals / pipeline ─────────────────────────────────────────────────────────────────
async function createDeal(tenantId, actorId, d) {
  if (!d.title) throw new CrmError("title required");
  const stage = DEAL_STATUSES[(d.stage || "QUALIFICATION").toUpperCase()] ? (d.stage || "QUALIFICATION").toUpperCase() : "QUALIFICATION";
  const status = dealStatusType(stage) === "Won" ? "WON" : dealStatusType(stage) === "Lost" ? "LOST" : "OPEN";
  const carry = d._slaCarry;

  let slaFields = {};
  if (carry) {
    slaFields = carry;
  } else {
    // independent deal: find + apply a Deal SLA (port of set_sla on CRM Deal)
    const sla = await findSla(tenantId, "Deal", d.priority);
    if (sla) slaFields = computeSla(sla, { sla_creation: new Date(), priority: d.priority, first_response_at: null });
  }

  const { rows } = await pool.query(
    `INSERT INTO crm_deals(tenant_id,title,account_id,contact_id,value,stage,probability,expected_close,next_step,
        status,lead_id,source,priority,owner_user_id,
        sla_id,sla_creation,response_by,resolution_by,first_response_at,sla_status,escalated)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [tenantId, d.title, d.accountId || null, d.contactId || null, d.value || 0, stage,
     d.probability != null ? d.probability : stageProbability(stage), d.expectedClose || null, d.nextStep || null,
     status, d.leadId || null, d.source || null, d.priority || null, actorId || null,
     slaFields.sla_id || null, slaFields.sla_creation || null, slaFields.response_by || null,
     slaFields.resolution_by || null, slaFields.first_response_at || null, slaFields.sla_status || null, !!slaFields.escalated]
  );
  return rows[0];
}
const listDeals = async (t) => (await pool.query("SELECT * FROM crm_deals WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;
async function getDeal(tenantId, dealId) {
  const { rows } = await pool.query("SELECT * FROM crm_deals WHERE tenant_id=$1 AND id=$2", [tenantId, dealId]);
  if (!rows[0]) throw new CrmError("Deal not found", 404);
  return rows[0];
}

// Set the primary contact (port of crm_deal.set_primary_contact / set_primary_email_mobile_no).
async function setPrimaryContact(tenantId, dealId, contactId) {
  const { rows: cr } = await pool.query("SELECT id FROM crm_contacts WHERE tenant_id=$1 AND id=$2", [tenantId, contactId]);
  if (!cr[0]) throw new CrmError("Contact not found", 404);
  const { rows } = await pool.query("UPDATE crm_deals SET contact_id=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, dealId, contactId]);
  if (!rows[0]) throw new CrmError("Deal not found", 404);
  return rows[0];
}

// Move stage (port of validate_status + update_default_probability + update_closed_date +
// add_status_change_log). Won/Lost set status + closed_at; Lost requires a lost_reason.
async function moveStage(tenantId, actorId, dealId, stage, opts = {}) {
  const key = (stage || "").toUpperCase();
  if (!DEAL_STATUSES[key]) throw new CrmError("Invalid stage");
  const deal = await getDeal(tenantId, dealId);
  const type = dealStatusType(key);
  const status = type === "Won" ? "WON" : type === "Lost" ? "LOST" : "OPEN";
  // lost-reason validation
  let lostReason = deal.lost_reason;
  if (type === "Lost") {
    lostReason = opts.lostReason || deal.lost_reason;
    if (!lostReason) throw new CrmError("Please specify a reason for losing the deal");
  }
  const closed = status === "OPEN" ? null : (deal.closed_at || new Date().toISOString());
  if (deal.stage !== key) {
    await logStatusChange(tenantId, "DEAL", dealId, deal.stage, key, actorId, deal.created_at);
  }
  const { rows } = await pool.query(
    "UPDATE crm_deals SET stage=$3, probability=$4, status=$5, closed_at=$6, lost_reason=$7 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, dealId, key, stageProbability(key), status, closed, lostReason || null]
  );
  return rows[0];
}

// Win → mark WON + create/link a Sundry-Debtors customer ledger in the books.
async function winDeal(tenantId, actorId, dealId) {
  const deal = await moveStage(tenantId, actorId, dealId, "WON");
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
  for (const s of OPEN_STAGES) {
    const ds = open.filter((d) => d.stage === s);
    byStage[s] = { count: ds.length, value: ds.reduce((x, d) => x + Number(d.value || 0), 0), deals: ds };
  }
  const won = deals.filter((d) => d.status === "WON");
  const lost = deals.filter((d) => d.status === "LOST");
  return {
    stages: byStage,
    stageOrder: OPEN_STAGES,
    weightedValue: Math.round(weightedValue(open)),
    openCount: open.length,
    wonCount: won.length,
    wonValue: won.reduce((x, d) => x + Number(d.value || 0), 0),
    lostCount: lost.length,
  };
}

// ── Tasks (port of crm_task.py) ──────────────────────────────────────────────────────
const TASK_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "DONE", "CANCELED"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
async function createTask(tenantId, actorId, t) {
  if (!t.title) throw new CrmError("title required");
  const status = TASK_STATUSES.includes((t.status || "TODO").toUpperCase()) ? (t.status || "TODO").toUpperCase() : "TODO";
  const priority = TASK_PRIORITIES.includes((t.priority || "MEDIUM").toUpperCase()) ? (t.priority || "MEDIUM").toUpperCase() : "MEDIUM";
  const refType = t.referenceType ? String(t.referenceType).toUpperCase() : null;
  if (refType && !["LEAD", "DEAL"].includes(refType)) throw new CrmError("referenceType must be LEAD or DEAL");
  const { rows } = await pool.query(
    `INSERT INTO crm_tasks(tenant_id,title,description,status,priority,start_date,due_date,reference_type,reference_id,assigned_to,created_by,completed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [tenantId, t.title, t.description || null, status, priority, t.startDate || null, t.dueDate || null,
     refType, t.referenceId || null, t.assignedTo || null, actorId || null, status === "DONE" ? new Date().toISOString() : null]
  );
  return rows[0];
}
async function listTasks(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.referenceType && filter.referenceId) {
    params.push(String(filter.referenceType).toUpperCase()); where.push(`reference_type=$${params.length}`);
    params.push(filter.referenceId); where.push(`reference_id=$${params.length}`);
  }
  const { rows } = await pool.query(`SELECT * FROM crm_tasks WHERE ${where.join(" AND ")} ORDER BY (status='DONE'), COALESCE(due_date, created_at) LIMIT 500`, params);
  return rows;
}
async function setTaskStatus(tenantId, taskId, status) {
  const key = (status || "").toUpperCase();
  if (!TASK_STATUSES.includes(key)) throw new CrmError("Invalid task status");
  const completed = key === "DONE" ? new Date().toISOString() : null;
  const { rows } = await pool.query(
    "UPDATE crm_tasks SET status=$3, completed_at=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, taskId, key, completed]
  );
  if (!rows[0]) throw new CrmError("Task not found", 404);
  return rows[0];
}
const completeTask = (tenantId, taskId) => setTaskStatus(tenantId, taskId, "DONE");

// ── Notes (port of fcrm_note.py) ─────────────────────────────────────────────────────
async function createNote(tenantId, actorId, n) {
  if (!n.content) throw new CrmError("content required");
  const refType = n.referenceType ? String(n.referenceType).toUpperCase() : null;
  if (refType && !["LEAD", "DEAL"].includes(refType)) throw new CrmError("referenceType must be LEAD or DEAL");
  const { rows } = await pool.query(
    "INSERT INTO crm_notes(tenant_id,title,content,reference_type,reference_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [tenantId, n.title || null, n.content, refType, n.referenceId || null, actorId || null]
  );
  return rows[0];
}
async function listNotes(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.referenceType && filter.referenceId) {
    params.push(String(filter.referenceType).toUpperCase()); where.push(`reference_type=$${params.length}`);
    params.push(filter.referenceId); where.push(`reference_id=$${params.length}`);
  }
  const { rows } = await pool.query(`SELECT * FROM crm_notes WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 500`, params);
  return rows;
}

// ── Activities + first-response (port of handle_communication_status) ────────────────
// Logging an OUTBOUND activity records first_response_at on the lead/deal when it's the
// first agent response, then recomputes the SLA status (Fulfilled / Failed / Due).
async function logActivity(tenantId, actorId, a) {
  const direction = a.direction && ["INBOUND", "OUTBOUND"].includes(String(a.direction).toUpperCase()) ? String(a.direction).toUpperCase() : null;
  const { rows } = await pool.query(
    "INSERT INTO crm_activities(tenant_id,kind,direction,subject,body,deal_id,lead_id,account_id,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [tenantId, a.kind || "NOTE", direction, a.subject || null, a.body || null, a.dealId || null, a.leadId || null, a.accountId || null, a.dueDate || null, actorId || null]
  );
  // first outbound communication → mark first_response_at + recompute SLA
  if (direction === "OUTBOUND") {
    const now = new Date();
    if (a.leadId) {
      const { rows: lr } = await pool.query("SELECT * FROM crm_leads WHERE tenant_id=$1 AND id=$2", [tenantId, a.leadId]);
      const lead = lr[0];
      if (lead && lead.sla_id && !lead.first_response_at) {
        const { rows: sr } = await pool.query("SELECT * FROM crm_slas WHERE tenant_id=$1 AND id=$2", [tenantId, lead.sla_id]);
        if (sr[0]) {
          const f = computeSla(sr[0], { sla_creation: lead.sla_creation, priority: lead.priority, first_response_at: now }, now);
          await pool.query(
            "UPDATE crm_leads SET first_response_at=$3, sla_status=$4, escalated=$5 WHERE tenant_id=$1 AND id=$2",
            [tenantId, lead.id, now.toISOString(), f.sla_status, f.escalated]
          );
        }
      }
    }
    if (a.dealId) {
      const { rows: dr } = await pool.query("SELECT * FROM crm_deals WHERE tenant_id=$1 AND id=$2", [tenantId, a.dealId]);
      const deal = dr[0];
      if (deal && deal.sla_id && !deal.first_response_at) {
        const { rows: sr } = await pool.query("SELECT * FROM crm_slas WHERE tenant_id=$1 AND id=$2", [tenantId, deal.sla_id]);
        if (sr[0]) {
          const f = computeSla(sr[0], { sla_creation: deal.sla_creation, priority: deal.priority, first_response_at: now }, now);
          await pool.query(
            "UPDATE crm_deals SET first_response_at=$3, sla_status=$4, escalated=$5 WHERE tenant_id=$1 AND id=$2",
            [tenantId, deal.id, now.toISOString(), f.sla_status, f.escalated]
          );
        }
      }
    }
  }
  return rows[0];
}
async function listActivities(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.dealId) { params.push(filter.dealId); where.push(`deal_id=$${params.length}`); }
  if (filter.leadId) { params.push(filter.leadId); where.push(`lead_id=$${params.length}`); }
  const { rows } = await pool.query(`SELECT * FROM crm_activities WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 500`, params);
  return rows;
}
async function completeActivity(tenantId, id) {
  await pool.query("UPDATE crm_activities SET done=true WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  return { ok: true };
}

// ── Unified timeline (status changes + activities + tasks + notes) ───────────────────
async function timeline(tenantId, refType, refId) {
  const type = String(refType || "").toUpperCase();
  if (!["LEAD", "DEAL"].includes(type)) throw new CrmError("reference must be LEAD or DEAL");
  const col = type === "LEAD" ? "lead_id" : "deal_id";
  const [acts, tasks, notes, logs] = await Promise.all([
    pool.query(`SELECT * FROM crm_activities WHERE tenant_id=$1 AND ${col}=$2 ORDER BY created_at DESC LIMIT 500`, [tenantId, refId]),
    listTasks(tenantId, { referenceType: type, referenceId: refId }),
    listNotes(tenantId, { referenceType: type, referenceId: refId }),
    pool.query("SELECT * FROM crm_status_change_log WHERE tenant_id=$1 AND reference_type=$2 AND reference_id=$3 ORDER BY created_at DESC LIMIT 500", [tenantId, type, refId]),
  ]);
  const events = [];
  for (const a of acts.rows) events.push({ type: "activity", at: a.created_at, kind: a.kind, direction: a.direction, subject: a.subject, body: a.body, id: a.id });
  for (const t of tasks) events.push({ type: "task", at: t.created_at, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, id: t.id });
  for (const n of notes) events.push({ type: "note", at: n.created_at, title: n.title, body: n.content, id: n.id });
  for (const l of logs.rows) events.push({ type: "status", at: l.created_at, from: l.from_status, to: l.to_status, duration_secs: l.duration_secs, id: l.id });
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

module.exports = {
  // constants + pure helpers (unit-testable)
  STAGES, OPEN_STAGES, LEAD_STATUSES, DEAL_STATUSES, TASK_STATUSES, TASK_PRIORITIES,
  stageProbability, dealStatusType, weightedValue, computeLeadScore,
  calcTime, calcElapsedTime, computeSla, slaConfig, defaultPriority, defaultWorkingHours,
  CrmError,
  // SLA
  createSla, listSlas, findSla,
  // accounts / contacts
  createAccount, listAccounts, createContact, listContacts, findContact,
  // leads
  createLead, listLeads, getLead, setLeadStatus, setLeadLostReason, convertLead, refreshLeadSla,
  // deals
  createDeal, listDeals, getDeal, moveStage, winDeal, pipeline, setPrimaryContact,
  // tasks / notes
  createTask, listTasks, setTaskStatus, completeTask, createNote, listNotes,
  // activities / status / timeline
  logActivity, listActivities, completeActivity, logStatusChange, timeline,
};
