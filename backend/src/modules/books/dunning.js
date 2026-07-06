// §M-DUN - DUNNING (escalating overdue-receivable reminders).
//
// A "dunning procedure" is an ordered ladder of LEVELS, each keyed on a minimum
// number of overdue days. As a receivable bill ages past each threshold it is
// promoted to the matching level, which carries an interest rate (% p.a.), a flat
// fee, and a templated letter whose TONE escalates (gentle → firm → final → legal).
//
// LOGIC ported (not copied) from:
//   • ERPNext (frappe/erpnext accounts/doctype/dunning_type + dunning): a
//     Dunning Type carries `dunning_letter_text` per `dunning_level`, an interest
//     rate, and a flat "dunning fee"; a Dunning document is raised against an
//     overdue Sales Invoice, accruing interest on the outstanding.
//   • Tryton (account_dunning): a `dunning.procedure` owns ordered `dunning.level`
//     rows; each level has a `sequence` and an `overdue` interval; a line is moved
//     to the FIRST level whose overdue threshold its days-overdue meets, walking
//     from the most-severe level down (so the highest matching level wins).
//
// This layer sits ON TOP of the already-posted ledger - it never posts a voucher
// itself (interest/fee are *proposed* amounts the caller may bill via documents).
// Reads open AR exactly the way billwise.openBills does: a SALES bill is a party
// DEBIT (receivable); outstanding = gross − Σ book_allocations against it.
//
// CommonJS. Money strictly through ./money (decimal.js); never JS-number math.
const { pool } = require("../../db");
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

// ── date helpers (pure, UTC 'YYYY-MM-DD') ────────────────────────────────────
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function parseYmd(s) {
  // pg returns DATE columns as JS Date objects constructed at LOCAL midnight, so
  // toISOString() shifts a day in +tz zones; read the local components instead.
  // Otherwise String(date).slice(0,10) yields "Wed Apr 01" → invalid.
  const str = s instanceof Date
    ? `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`
    : String(s).slice(0, 10);
  const d = new Date(`${str}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new PostError("BAD_INPUT", `invalid date ${s}`, 400);
  return d;
}
function daysBetween(fromStr, toStr) {
  return Math.round((parseYmd(toStr).getTime() - parseYmd(fromStr).getTime()) / 86400000);
}

// ── default ladder (used when a tenant has not configured its own) ───────────
// Four escalating levels. Each: minDays threshold, interest %/p.a., flat fee, and
// a {salutation, body} letter template with placeholders the caller fills.
const DEFAULT_LEVELS = [
  { level: 1, name: "Reminder", minOverdueDays: 1, interestPct: "0", fee: "0", tone: "gentle",
    subject: "Friendly reminder: invoice {{invoiceNumber}} is now due",
    body: "Dear {{party}},\n\nOur records show invoice {{invoiceNumber}} dated {{invoiceDate}} for {{outstanding}} became due on {{dueDate}} and is now {{daysOverdue}} day(s) overdue. We would be grateful if you could arrange payment at your earliest convenience.\n\nIf you have already paid, please disregard this note.\n\nKind regards,\n{{company}}" },
  { level: 2, name: "Second reminder", minOverdueDays: 15, interestPct: "12", fee: "0", tone: "firm",
    subject: "Second reminder: invoice {{invoiceNumber}} is {{daysOverdue}} days overdue",
    body: "Dear {{party}},\n\nDespite our earlier reminder, invoice {{invoiceNumber}} ({{outstanding}}) remains unpaid and is now {{daysOverdue}} day(s) overdue. Interest of {{interest}} has accrued. Please settle the total of {{totalDue}} within 7 days.\n\nRegards,\n{{company}}" },
  { level: 3, name: "Final notice", minOverdueDays: 30, interestPct: "18", fee: "250", tone: "final",
    subject: "FINAL NOTICE: overdue invoice {{invoiceNumber}}",
    body: "Dear {{party}},\n\nThis is a FINAL notice for invoice {{invoiceNumber}}, now {{daysOverdue}} day(s) overdue. The amount payable is {{outstanding}} plus accrued interest {{interest}} and a dunning fee {{fee}}, a total of {{totalDue}}. Payment must reach us within 7 days to avoid further action.\n\n{{company}}" },
  { level: 4, name: "Pre-legal", minOverdueDays: 60, interestPct: "24", fee: "500", tone: "legal",
    subject: "Pre-legal demand: invoice {{invoiceNumber}}",
    body: "Dear {{party}},\n\nInvoice {{invoiceNumber}} is {{daysOverdue}} day(s) overdue and remains unpaid despite repeated reminders. The total now demanded is {{totalDue}} (principal {{outstanding}}, interest {{interest}}, fee {{fee}}). Unless paid within 7 days we will refer this matter for recovery, and you may be liable for additional costs.\n\n{{company}}" },
];

// Validate + normalise a levels[] ladder. Pure. Returns levels sorted ASCENDING
// by minOverdueDays with sequential level numbers and string money fields.
function validateLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new PostError("BAD_INPUT", "levels[] required (at least one)", 422);
  }
  const clean = levels.map((l, i) => {
    const minOverdueDays = Number(l && l.minOverdueDays);
    if (!Number.isFinite(minOverdueDays) || minOverdueDays < 0) {
      throw new PostError("BAD_LEVEL", `level #${i + 1}: minOverdueDays must be ≥ 0`, 422);
    }
    const interestPct = money(l && l.interestPct != null ? l.interestPct : 0);
    if (interestPct.lessThan(0)) throw new PostError("BAD_LEVEL", `level #${i + 1}: interestPct cannot be negative`, 422);
    const fee = money(l && l.fee != null ? l.fee : 0);
    if (fee.lessThan(0)) throw new PostError("BAD_LEVEL", `level #${i + 1}: fee cannot be negative`, 422);
    return {
      minOverdueDays,
      name: (l && l.name) || `Level ${i + 1}`,
      tone: (l && l.tone) || "firm",
      interestPct: interestPct.toString(),
      fee: toDb(fee),
      subject: (l && l.subject) || "Overdue invoice {{invoiceNumber}}",
      body: (l && l.body) || "Dear {{party}}, invoice {{invoiceNumber}} for {{outstanding}} is {{daysOverdue}} day(s) overdue. Total due {{totalDue}}.",
    };
  });
  // sort ascending by threshold, then number sequentially (most-severe = last).
  clean.sort((a, b) => a.minOverdueDays - b.minOverdueDays);
  // thresholds must be strictly increasing so each level owns a distinct band.
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].minOverdueDays <= clean[i - 1].minOverdueDays) {
      throw new PostError("BAD_LEVEL", "level minOverdueDays must be strictly increasing", 422);
    }
  }
  return clean.map((l, i) => ({ level: i + 1, ...l }));
}

// Pick the level a given days-overdue lands in: the HIGHEST level whose threshold
// is met (Tryton's "walk from most severe down"). null if below the first rung.
// `levels` must be ascending (as validateLevels returns).
function matchLevel(levels, daysOverdue) {
  let hit = null;
  for (const lvl of levels) {
    if (daysOverdue >= lvl.minOverdueDays) hit = lvl;
    else break;
  }
  return hit;
}

// Pure interest accrual: principal × pct/100 × daysOverdue/365 (simple, p.a.),
// mirroring automation.computeLateFee so the two stay consistent.
function accrueInterest(principal, interestPct, daysOverdue) {
  if (daysOverdue <= 0) return money(0);
  return money(principal).mul(money(interestPct)).div(100).mul(daysOverdue).div(365);
}

// Fill {{placeholders}} in a template string from a flat map. Pure; unknown
// tokens are left intact so a partial map never silently blanks a letter.
function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// ── config: procedure (the ladder) ──────────────────────────────────────────

// Persist the tenant's ladder (single named procedure per tenant; default name).
async function setDunningProcedure(tenantId, { name, levels } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const procName = (name && String(name).trim()) || "Default";
  const clean = validateLevels(levels);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // a "procedure" is just the set of levels sharing (tenant, procedure) - rebuild it.
    await client.query("DELETE FROM book_dunning_levels WHERE tenant_id=$1 AND procedure=$2", [tenantId, procName]);
    for (const l of clean) {
      await client.query(
        `INSERT INTO book_dunning_levels(tenant_id, procedure, level, name, min_overdue_days, interest_pct, fee, tone, subject, body)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, procName, l.level, l.name, l.minOverdueDays, l.interestPct, l.fee, l.tone, l.subject, l.body]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return listDunningLevels(tenantId, procName);
}

// List the configured ladder (ascending). Falls back to DEFAULT_LEVELS, marking
// `configured:false`, when the tenant has not saved one - so a run always works.
async function listDunningLevels(tenantId, procName) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const procedure = (procName && String(procName).trim()) || "Default";
  const { rows } = await pool.query(
    `SELECT level, name, min_overdue_days, interest_pct, fee, tone, subject, body
       FROM book_dunning_levels
      WHERE tenant_id=$1 AND procedure=$2
      ORDER BY min_overdue_days ASC`,
    [tenantId, procedure]
  );
  if (!rows.length) {
    return {
      procedure,
      configured: false,
      levels: DEFAULT_LEVELS.map((l) => ({
        level: l.level, name: l.name, minOverdueDays: l.minOverdueDays,
        interestPct: l.interestPct, fee: toRupees(l.fee), tone: l.tone,
        subject: l.subject, body: l.body,
      })),
    };
  }
  return {
    procedure,
    configured: true,
    levels: rows.map((r) => ({
      level: r.level, name: r.name, minOverdueDays: Number(r.min_overdue_days),
      interestPct: money(r.interest_pct).toString(), fee: toRupees(r.fee), tone: r.tone,
      subject: r.subject, body: r.body,
    })),
  };
}

// Resolve the ascending levels (validated) for a run - DB ladder if present, else
// the in-code default ladder.
async function resolveLevels(tenantId, procName) {
  const cfg = await listDunningLevels(tenantId, procName);
  return validateLevels(cfg.levels);
}

// ── read open AR (overdue receivables) ───────────────────────────────────────
// Same outstanding shape as billwise.openBills, but SALES-only (receivables) and
// returns ALL open SALES bills with their dueDate/daysOverdue computed at asOf.
async function openReceivables(tenantId, asOfDate) {
  const asOf = asOfDate ? ymd(parseYmd(asOfDate)) : ymd(new Date());
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_number, v.voucher_date, v.party_ledger_id,
            pl.name AS party_name,
            COALESCE(pl.credit_period_days,0) AS credit_period_days,
            COALESCE((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
       LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false
      ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
    [tenantId]
  );
  const out = [];
  for (const r of rows) {
    const outstanding = money(r.gross).minus(money(r.allocated));
    if (!outstanding.greaterThan(0)) continue; // settled - nothing to dun
    const creditDays = Number(r.credit_period_days) || 0;
    const dueDate = ymd(new Date(parseYmd(r.voucher_date).getTime() + creditDays * 86400000));
    const daysOverdue = Math.max(0, daysBetween(dueDate, asOf));
    out.push({
      voucherId: r.id,
      number: r.voucher_number,
      partyLedgerId: r.party_ledger_id,
      partyName: r.party_name || "Customer",
      invoiceDate: ymd(parseYmd(r.voucher_date)),
      dueDate,
      outstanding,
      daysOverdue,
    });
  }
  return { asOf, bills: out };
}

// (read-only) the overdue AR that WOULD be dunned at asOf, with its matched level
// and proposed interest/fee - without recording a run. Powers GET /dunning/due.
async function dueDunnings(tenantId, { asOfDate, procedure } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const levels = await resolveLevels(tenantId, procedure);
  const { asOf, bills } = await openReceivables(tenantId, asOfDate);
  const items = [];
  for (const b of bills) {
    const lvl = matchLevel(levels, b.daysOverdue);
    if (!lvl) continue; // not yet overdue enough for the first rung
    const interest = accrueInterest(b.outstanding, lvl.interestPct, b.daysOverdue);
    const fee = money(lvl.fee);
    const totalDue = b.outstanding.plus(interest).plus(fee);
    items.push({
      voucherId: b.voucherId,
      number: b.number,
      partyLedgerId: b.partyLedgerId,
      partyName: b.partyName,
      invoiceDate: b.invoiceDate,
      dueDate: b.dueDate,
      daysOverdue: b.daysOverdue,
      level: lvl.level,
      levelName: lvl.name,
      tone: lvl.tone,
      outstanding: toRupees(b.outstanding),
      interest: toRupees(interest),
      fee: toRupees(fee),
      totalDue: toRupees(totalDue),
    });
  }
  return { asOf, procedure: (procedure && String(procedure).trim()) || "Default", count: items.length, items };
}

// ── generate (advance each overdue bill to its level + produce letters) ──────
// Records ONE book_dunning_runs row per bill that lands on a level at asOf, but
// only when the bill has CROSSED to a level at least as severe as its last run
// (so re-running on the same day is idempotent and we never regress a bill).
// Returns the letter payloads for everything advanced this run.
async function generateDunnings(tenantId, asOfDate, opts = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const procedure = (opts.procedure && String(opts.procedure).trim()) || "Default";
  const levels = await resolveLevels(tenantId, procedure);
  const { asOf } = await openReceivables(tenantId, asOfDate); // normalises asOf
  const dry = !!opts.dryRun;

  // company name for the letter signature (best-effort).
  const { rows: co } = await pool.query(
    "SELECT company_name, legal_name FROM tenant_profile WHERE tenant_id=$1",
    [tenantId]
  );
  const company = (co[0] && (co[0].company_name || co[0].legal_name)) || "Accounts Team";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock this tenant's open SALES vouchers + their allocations so a concurrent
    // run can't compute outstanding against shifting headroom.
    await client.query(
      `SELECT id FROM book_vouchers
        WHERE tenant_id=$1 AND voucher_type='SALES' AND is_cancelled=false FOR UPDATE`,
      [tenantId]
    );

    // recompute open receivables INSIDE the txn (post-lock) for correctness.
    const { rows: brows } = await client.query(
      `SELECT v.id, v.voucher_number, v.voucher_date, v.party_ledger_id,
              pl.name AS party_name, COALESCE(pl.credit_period_days,0) AS credit_period_days,
              COALESCE((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
              COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
         FROM book_vouchers v
         LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
        WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false
        ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
      [tenantId]
    );

    const letters = [];
    let advanced = 0;
    let skippedNotDue = 0;
    let skippedAlready = 0;

    for (const r of brows) {
      const outstanding = money(r.gross).minus(money(r.allocated));
      if (!outstanding.greaterThan(0)) continue;
      const creditDays = Number(r.credit_period_days) || 0;
      const dueDate = ymd(new Date(parseYmd(r.voucher_date).getTime() + creditDays * 86400000));
      const daysOverdue = Math.max(0, daysBetween(dueDate, asOf));
      const lvl = matchLevel(levels, daysOverdue);
      if (!lvl) { skippedNotDue++; continue; }

      // highest level already recorded for this bill (don't regress / don't repeat).
      const { rows: prev } = await client.query(
        `SELECT MAX(level) AS max_level FROM book_dunning_runs
          WHERE tenant_id=$1 AND voucher_id=$2`,
        [tenantId, r.id]
      );
      const prevLevel = prev[0] && prev[0].max_level != null ? Number(prev[0].max_level) : 0;
      if (lvl.level <= prevLevel) { skippedAlready++; continue; }

      const interest = accrueInterest(outstanding, lvl.interestPct, daysOverdue);
      const fee = money(lvl.fee);
      const totalDue = outstanding.plus(interest).plus(fee);

      const vars = {
        party: r.party_name || "Customer",
        company,
        invoiceNumber: `SALES-${r.voucher_number}`,
        invoiceDate: ymd(parseYmd(r.voucher_date)),
        dueDate,
        daysOverdue,
        outstanding: toRupees(outstanding),
        interest: toRupees(interest),
        fee: toRupees(fee),
        totalDue: toRupees(totalDue),
        level: lvl.level,
        levelName: lvl.name,
      };
      const letter = {
        voucherId: r.id,
        invoiceNumber: vars.invoiceNumber,
        partyLedgerId: r.party_ledger_id,
        partyName: vars.party,
        level: lvl.level,
        levelName: lvl.name,
        tone: lvl.tone,
        daysOverdue,
        outstanding: toRupees(outstanding),
        interest: toRupees(interest),
        fee: toRupees(fee),
        totalDue: toRupees(totalDue),
        subject: fillTemplate(lvl.subject, vars),
        body: fillTemplate(lvl.body, vars),
      };

      if (!dry) {
        await client.query(
          `INSERT INTO book_dunning_runs
             (tenant_id, voucher_id, party_ledger_id, procedure, level, level_name, tone,
              as_of_date, days_overdue, outstanding, interest, fee, total_due, subject, body, created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [tenantId, r.id, r.party_ledger_id, procedure, lvl.level, lvl.name, lvl.tone,
           asOf, daysOverdue, toDb(outstanding), toDb(interest), toDb(fee), toDb(totalDue),
           letter.subject, letter.body, opts.actorId || null]
        );
      }
      letters.push(letter);
      advanced++;
    }

    if (dry) await client.query("ROLLBACK"); else await client.query("COMMIT");
    return { asOf, procedure, advanced, skippedNotDue, skippedAlready, dryRun: dry, letters };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── dispatch (send a generated letter through a REAL channel) ────────────────
// A letter is only marked dispatched when Twilio/SMTP actually accepted it.
// Unconfigured channel or missing party contact → honest PostError, no fake send.

// Recent persisted runs with dispatch status + whether the party is reachable.
async function listRuns(tenantId, { voucherId, limit } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [tenantId];
  let where = "r.tenant_id=$1";
  if (voucherId) { params.push(voucherId); where += ` AND r.voucher_id=$${params.length}`; }
  params.push(cap);
  const { rows } = await pool.query(
    `SELECT r.id, r.voucher_id, r.party_ledger_id, r.procedure, r.level, r.level_name, r.tone,
            r.as_of_date, r.days_overdue, r.outstanding, r.interest, r.fee, r.total_due,
            r.subject, r.body, r.created_at, r.dispatched_at, r.dispatch_channel, r.dispatch_to,
            pl.name AS party_name, pl.email AS party_email, pl.phone AS party_phone
       FROM book_dunning_runs r
       LEFT JOIN book_ledgers pl ON pl.id=r.party_ledger_id AND pl.tenant_id=r.tenant_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    voucherId: r.voucher_id,
    partyLedgerId: r.party_ledger_id,
    partyName: r.party_name || "Customer",
    hasEmail: !!(r.party_email && String(r.party_email).trim()),
    hasPhone: !!(r.party_phone && String(r.party_phone).trim()),
    procedure: r.procedure,
    level: r.level,
    levelName: r.level_name,
    tone: r.tone,
    asOf: ymd(parseYmd(r.as_of_date)),
    daysOverdue: Number(r.days_overdue),
    outstanding: toRupees(money(r.outstanding)),
    interest: toRupees(money(r.interest)),
    fee: toRupees(money(r.fee)),
    totalDue: toRupees(money(r.total_due)),
    subject: r.subject,
    body: r.body,
    createdAt: r.created_at,
    dispatchedAt: r.dispatched_at,
    dispatchChannel: r.dispatch_channel,
    dispatchTo: r.dispatch_to,
  }));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function dispatchRun(tenantId, runId, { channel } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const ch = String(channel || "").toLowerCase();
  if (ch !== "whatsapp" && ch !== "email") {
    throw new PostError("BAD_CHANNEL", "channel must be 'whatsapp' or 'email'", 422);
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.subject, r.body, r.party_ledger_id,
            pl.name AS party_name, pl.email AS party_email, pl.phone AS party_phone
       FROM book_dunning_runs r
       LEFT JOIN book_ledgers pl ON pl.id=r.party_ledger_id AND pl.tenant_id=r.tenant_id
      WHERE r.id=$1 AND r.tenant_id=$2`,
    [runId, tenantId]
  );
  const run = rows[0];
  if (!run) throw new PostError("NOT_FOUND", "dunning letter not found", 404);

  let sentTo;
  if (ch === "whatsapp") {
    const phone = (run.party_phone || "").replace(/\s/g, "");
    if (!phone) {
      throw new PostError("NO_PHONE", `${run.party_name || "This customer"} has no phone on their ledger - add one under Books → Ledgers, then retry.`, 422);
    }
    const to = phone.startsWith("+") ? phone : `+91${phone.replace(/^0+/, "")}`;
    const { sendWhatsApp } = require("../../lib/whatsapp");
    const delivered = await sendWhatsApp(to, `*${run.subject}*\n\n${run.body}`);
    if (!delivered) {
      throw new PostError("CHANNEL_NOT_CONFIGURED", "WhatsApp isn't configured on the server (missing Twilio keys) - the letter was NOT sent.", 503);
    }
    sentTo = to;
  } else {
    const email = (run.party_email || "").trim();
    if (!email) {
      throw new PostError("NO_EMAIL", `${run.party_name || "This customer"} has no email on their ledger - add one under Books → Ledgers, then retry.`, 422);
    }
    if (!process.env.SMTP_USER) {
      throw new PostError("CHANNEL_NOT_CONFIGURED", "Email isn't configured on the server (missing SMTP keys) - the letter was NOT sent.", 503);
    }
    const { sendMail } = require("../../lib/email");
    const html = `<tr><td style="padding:24px 32px"><p style="font-size:14px;color:#e8e8dc;font-family:system-ui,sans-serif;white-space:pre-wrap;margin:0">${esc(run.body)}</p></td></tr>`;
    await sendMail({ to: email, subject: run.subject, html });
    sentTo = email;
  }

  const { rows: upd } = await pool.query(
    `UPDATE book_dunning_runs SET dispatched_at=now(), dispatch_channel=$3, dispatch_to=$4
      WHERE id=$1 AND tenant_id=$2
      RETURNING id, dispatched_at, dispatch_channel, dispatch_to`,
    [runId, tenantId, ch, sentTo]
  );
  return { ok: true, id: upd[0].id, dispatchedAt: upd[0].dispatched_at, channel: upd[0].dispatch_channel, to: upd[0].dispatch_to };
}

module.exports = {
  setDunningProcedure,
  listDunningLevels,
  generateDunnings,
  dueDunnings,
  openReceivables,
  listRuns,
  dispatchRun,
  // pure helpers (exported for testability)
  validateLevels,
  matchLevel,
  accrueInterest,
  fillTemplate,
  DEFAULT_LEVELS,
};
