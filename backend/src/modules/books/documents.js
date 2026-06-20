// §7 (M2) — Document pipelines. Estimate/SO/Challan and PO/GRN are NON-POSTING
// documents; only converting to an Invoice (SALES) or Bill (PURCHASE) hits the
// ledger via the posting engine. Plus advances/credit allocation, Undeposited
// Funds deposits, and recurring templates.
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { financialYearFor } = require("./fy");
const { postVoucher, PostError } = require("./posting-engine");
const { buildSalesVoucher, buildPurchaseVoucher, buildSalesVoucherLines, buildPurchaseVoucherLines } = require("./mappers");
const { ledgerIdByName } = require("./seed");
const auto = require("./automation");

// Allowed conversions. "INVOICE"/"BILL" are terminal (they post a voucher).
const NEXT = {
  ESTIMATE: ["SALES_ORDER", "DELIVERY_CHALLAN", "INVOICE"],
  SALES_ORDER: ["DELIVERY_CHALLAN", "INVOICE"],
  DELIVERY_CHALLAN: ["INVOICE"],
  PURCHASE_ORDER: ["GRN", "BILL"],
  GRN: ["BILL"],
};

async function nextDocNumber(client, tenantId, kind, fy) {
  const { rows } = await client.query(
    `INSERT INTO book_voucher_counters(tenant_id,voucher_type,financial_year,next_number) VALUES($1,$2,$3,2)
       ON CONFLICT(tenant_id,voucher_type,financial_year) DO UPDATE SET next_number = book_voucher_counters.next_number + 1
     RETURNING next_number - 1 AS number`,
    [tenantId, `DOC_${kind}`, fy]
  );
  return Number(rows[0].number);
}

async function createDocument(tenantId, actorId, d) {
  if (!d.docKind || !d.docDate) throw new PostError("BAD_INPUT", "docKind and docDate required", 400);
  const fy = financialYearFor(d.docDate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const num = await nextDocNumber(client, tenantId, d.docKind, fy);
    const { rows } = await client.query(
      `INSERT INTO book_documents(tenant_id,doc_kind,doc_number,doc_date,financial_year,party_ledger_id,status,parent_document_id,subtotal,gst_rate,inter_state,hsn_sac,lines,narration,reference,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [tenantId, d.docKind, num, d.docDate, fy, d.partyLedgerId || null, d.parentDocumentId || null,
       toDb(d.subtotal || 0), toDb(d.gstRate || 0), !!d.interState, d.hsn || null,
       d.lines ? JSON.stringify(d.lines) : null, d.narration || null, d.reference || null, actorId || null]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

async function salesCtx(tenantId, customerLedgerId) {
  const ctx = {
    customerLedgerId,
    salesLedgerId: await ledgerIdByName(tenantId, "Sales"),
    cgstLedgerId: await ledgerIdByName(tenantId, "CGST Output"),
    sgstLedgerId: await ledgerIdByName(tenantId, "SGST Output"),
    igstLedgerId: await ledgerIdByName(tenantId, "IGST Output"),
  };
  if (!ctx.salesLedgerId || !ctx.cgstLedgerId || !ctx.sgstLedgerId || !ctx.igstLedgerId) throw new PostError("NOT_SEEDED", "Sales/tax ledgers missing — seed first", 422);
  return ctx;
}
async function purchaseCtx(tenantId, vendorLedgerId) {
  const ctx = {
    vendorLedgerId,
    purchaseLedgerId: await ledgerIdByName(tenantId, "Purchases"),
    cgstInputLedgerId: await ledgerIdByName(tenantId, "CGST Input"),
    sgstInputLedgerId: await ledgerIdByName(tenantId, "SGST Input"),
    igstInputLedgerId: await ledgerIdByName(tenantId, "IGST Input"),
  };
  if (!ctx.purchaseLedgerId || !ctx.cgstInputLedgerId || !ctx.sgstInputLedgerId || !ctx.igstInputLedgerId) throw new PostError("NOT_SEEDED", "Purchase/tax ledgers missing — seed first", 422);
  return ctx;
}

async function convertDocument(tenantId, actorId, docId, toKind, opts = {}) {
  const { rows: dr } = await pool.query("SELECT * FROM book_documents WHERE tenant_id=$1 AND id=$2", [tenantId, docId]);
  const doc = dr[0];
  if (!doc) throw new PostError("NOT_FOUND", "Document not found", 404);
  if (doc.status === "CONVERTED" || doc.status === "CANCELLED") throw new PostError("BAD_STATE", `Document is ${doc.status}`, 409);
  if (!(NEXT[doc.doc_kind] || []).includes(toKind)) throw new PostError("BAD_TRANSITION", `Cannot convert ${doc.doc_kind} → ${toKind}`, 422);

  if (toKind === "INVOICE" || toKind === "BILL") {
    // Line-itemised path when the document carries a non-empty lines[] array;
    // otherwise the exact legacy single-rate (subtotal + gst_rate) behaviour.
    const lines = Array.isArray(doc.lines) ? doc.lines : null;
    const hasLines = lines && lines.length > 0;
    const ref = doc.reference || `${doc.doc_kind} #${doc.doc_number}`;
    const base = { interState: doc.inter_state, date: opts.date || doc.doc_date, reference: ref, narration: doc.narration };
    const input = hasLines
      ? { ...base, lines }
      : { ...base, lineTotal: doc.subtotal, gstRate: doc.gst_rate, hsn: doc.hsn_sac };
    let m;
    if (toKind === "INVOICE") {
      const ctx = await salesCtx(tenantId, doc.party_ledger_id);
      m = hasLines ? buildSalesVoucherLines(input, ctx) : buildSalesVoucher(input, ctx);
    } else {
      const ctx = await purchaseCtx(tenantId, doc.party_ledger_id);
      m = hasLines ? buildPurchaseVoucherLines(input, ctx) : buildPurchaseVoucher(input, ctx);
    }
    // Gross = the party-ledger movement on this voucher (customer debit / vendor credit).
    const gross = Math.abs(m.entries.filter((e) => e.ledgerId === doc.party_ledger_id).reduce((s, e) => s + Number(e.debit || 0) - Number(e.credit || 0), 0));
    // Approval gate — when a rule for this entity exists and the amount crosses its
    // threshold, the document can only post once an APPROVED record exists for it.
    const entityType = toKind === "INVOICE" ? "invoice" : "bill";
    if (!opts.skipApproval && (await auto.requiresApproval(tenantId, entityType, gross))) {
      const { rows: ap } = await pool.query("SELECT 1 FROM book_approvals WHERE tenant_id=$1 AND entity_type='document' AND entity_id=$2 AND status='APPROVED' LIMIT 1", [tenantId, docId]);
      if (!ap[0]) throw new PostError("NEEDS_APPROVAL", `This ${entityType} (₹${gross.toFixed(0)}) needs approval before posting — request approval first`, 409);
    }
    // Credit-limit gate (sales) — block if the customer's outstanding + this invoice
    // would exceed their credit limit, unless explicitly overridden.
    if (toKind === "INVOICE" && !opts.overrideCreditLimit) {
      const { rows: cl } = await pool.query("SELECT credit_limit FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, doc.party_ledger_id]);
      const limit = cl[0] && cl[0].credit_limit ? Number(cl[0].credit_limit) : 0;
      if (limit > 0) {
        const { rows: o } = await pool.query("SELECT COALESCE(SUM(e.debit-e.credit),0) AS bal FROM book_voucher_entries e JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false WHERE e.tenant_id=$1 AND e.ledger_id=$2", [tenantId, doc.party_ledger_id]);
        const outstanding = Number(o[0].bal || 0);
        if (outstanding + gross > limit) throw new PostError("CREDIT_LIMIT_EXCEEDED", `Credit limit ₹${limit.toFixed(0)} exceeded — outstanding ₹${outstanding.toFixed(0)} + ₹${gross.toFixed(0)}. Override to proceed.`, 409);
      }
    }
    const r = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes });
    await pool.query("UPDATE book_documents SET status='CONVERTED', converted_voucher_id=$2 WHERE id=$1", [docId, r.voucherId]);
    return { document: docId, voucher: r };
  }

  // Non-posting → next non-posting document, linked; mark source converted.
  const child = await createDocument(tenantId, actorId, {
    docKind: toKind, docDate: opts.date || doc.doc_date, partyLedgerId: doc.party_ledger_id, parentDocumentId: docId,
    subtotal: doc.subtotal, gstRate: doc.gst_rate, interState: doc.inter_state, hsn: doc.hsn_sac, lines: doc.lines, narration: doc.narration, reference: doc.reference,
  });
  await pool.query("UPDATE book_documents SET status='CONVERTED' WHERE id=$1", [docId]);
  return { document: docId, child };
}

async function cancelDocument(tenantId, docId) {
  const { rows } = await pool.query("UPDATE book_documents SET status='CANCELLED' WHERE tenant_id=$1 AND id=$2 AND status<>'CONVERTED' RETURNING id", [tenantId, docId]);
  if (!rows[0]) throw new PostError("BAD_STATE", "Document not found or already converted", 409);
  return { ok: true };
}

async function listDocuments(tenantId, filter = {}) {
  const params = [tenantId]; const where = ["tenant_id=$1"];
  if (filter.kind) { params.push(filter.kind); where.push(`doc_kind=$${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`status=$${params.length}`); }
  if (filter.party) { params.push(filter.party); where.push(`party_ledger_id=$${params.length}`); }
  const { rows } = await pool.query(`SELECT * FROM book_documents WHERE ${where.join(" AND ")} ORDER BY doc_date DESC, created_at DESC LIMIT 500`, params);
  return rows;
}

// Advance / credit application — a reporting link (ledger movement already posted).
async function allocate(tenantId, actorId, sourceVoucherId, targetVoucherId, amount) {
  if (!sourceVoucherId || !targetVoucherId || amount == null) throw new PostError("BAD_INPUT", "sourceVoucherId, targetVoucherId, amount required", 400);
  const { rows } = await pool.query(
    "INSERT INTO book_allocations(tenant_id,source_voucher_id,target_voucher_id,amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [tenantId, sourceVoucherId, targetVoucherId, toDb(amount), actorId || null]
  );
  return rows[0];
}

// Undeposited Funds → Bank: a CONTRA (Dr Bank / Cr Undeposited Funds).
async function recordDeposit(tenantId, actorId, bankLedgerId, amount, date) {
  const undep = await ledgerIdByName(tenantId, "Undeposited Funds");
  if (!undep) throw new PostError("NOT_SEEDED", "Undeposited Funds ledger missing — seed first", 422);
  if (!bankLedgerId || amount == null || !date) throw new PostError("BAD_INPUT", "bankLedgerId, amount, date required", 400);
  return postVoucher(tenantId, actorId, { voucherType: "CONTRA", voucherDate: date, narration: "Deposit of undeposited funds", source: "manual" },
    [{ ledgerId: bankLedgerId, debit: toDb(amount), credit: "0" }, { ledgerId: undep, debit: "0", credit: toDb(amount) }]);
}

// Recurring templates.
function advanceDate(dateStr, freq) {
  const d = new Date(dateStr);
  ({ WEEKLY: () => d.setUTCDate(d.getUTCDate() + 7), MONTHLY: () => d.setUTCMonth(d.getUTCMonth() + 1), QUARTERLY: () => d.setUTCMonth(d.getUTCMonth() + 3), YEARLY: () => d.setUTCFullYear(d.getUTCFullYear() + 1) }[freq] || (() => d.setUTCMonth(d.getUTCMonth() + 1)))();
  return d.toISOString().slice(0, 10);
}
async function createRecurring(tenantId, actorId, r) {
  if (!r.name || !r.templateKind || !r.frequency || !r.nextRun) throw new PostError("BAD_INPUT", "name, templateKind, frequency, nextRun required", 400);
  const { rows } = await pool.query(
    "INSERT INTO book_recurring(tenant_id,name,template_kind,template,frequency,next_run,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [tenantId, r.name, r.templateKind, JSON.stringify(r.template || {}), r.frequency, r.nextRun, actorId || null]
  );
  return rows[0];
}
// Generate all due recurring docs as of a date. (A scheduler/worker would call
// this daily; for now it's an explicit endpoint — no queue infra yet.)
async function runRecurringDue(tenantId, actorId, asOf) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query("SELECT * FROM book_recurring WHERE tenant_id=$1 AND active=true AND next_run<=$2", [tenantId, today]);
  const generated = [];
  for (const r of rows) {
    const tmpl = r.template || {};
    // Catch up EVERY missed period (e.g. after downtime): generate one voucher
    // per period dated at that period's date, advancing next_run from the stored
    // anchor — not from today — so nothing is silently dropped. Cap to avoid runaway.
    let runDate = r.next_run instanceof Date ? r.next_run.toISOString().slice(0, 10) : String(r.next_run).slice(0, 10);
    let iterations = 0;
    const MAX_CATCHUP = 60;
    while (runDate <= today && iterations < MAX_CATCHUP) {
      iterations++;
      try {
        let res = null;
        if (r.template_kind === "SALES_INVOICE") {
          const m = buildSalesVoucher({ ...tmpl, date: runDate }, await salesCtx(tenantId, tmpl.customerLedgerId));
          res = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes });
        } else if (r.template_kind === "BILL") {
          const m = buildPurchaseVoucher({ ...tmpl, date: runDate }, await purchaseCtx(tenantId, tmpl.vendorLedgerId));
          res = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes });
        } else if (r.template_kind === "JOURNAL") {
          res = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: runDate, narration: tmpl.narration || r.name, source: "api" }, tmpl.entries || []);
        }
        const nextRun = advanceDate(runDate, r.frequency);
        await pool.query("UPDATE book_recurring SET last_run=$2, next_run=$3 WHERE id=$1", [r.id, runDate, nextRun]);
        generated.push({ recurring: r.id, name: r.name, period: runDate, voucher: res });
        runDate = nextRun;
      } catch (e) {
        generated.push({ recurring: r.id, name: r.name, period: runDate, error: e.message });
        break; // stop catching up this template on first failure to avoid duplicating on retry
      }
    }
  }
  return { asOf: today, generated };
}

// Run recurring for every tenant that has an active template (the daily cron uses this).
async function runAllRecurring(asOf) {
  const { rows } = await pool.query("SELECT DISTINCT tenant_id FROM book_recurring WHERE active=true");
  const out = [];
  for (const r of rows) {
    try { const res = await runRecurringDue(r.tenant_id, null, asOf); out.push({ tenant: r.tenant_id, generated: res.generated.length }); }
    catch (e) { out.push({ tenant: r.tenant_id, error: e.message }); }
  }
  return { tenants: rows.length, results: out };
}

module.exports = { createDocument, convertDocument, cancelDocument, listDocuments, allocate, recordDeposit, createRecurring, runRecurringDue, runAllRecurring, salesCtx, purchaseCtx, NEXT };
