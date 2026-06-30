// §M-VT - VOUCHER TOOLS. Three Tally-flavoured conveniences that all bottom out
// in the posting-engine so the ledger invariant is never bypassed:
//   (1) reversing journals - a JOURNAL now plus its auto-reversal, future-dated;
//   (2) voucher templates  - reusable JSON entry skeletons (book_voucher_templates);
//   (3) post-dated cheques - a PDC register (book_pdc) that posts the real
//       RECEIPT/PAYMENT only when the cheque actually clears.
// Money stays as strings via ./money; every ledger movement goes through postVoucher.
const { pool } = require("../../db");
const { postVoucher, PostError } = require("./posting-engine");
const { money, toDb } = require("./money");

// (1) Reversing journal - Tally's "reversing journal": post the JOURNAL today,
// then immediately post its mirror (debit/credit swapped) dated in the future, so
// the effect self-cancels on/after reverseDate. Both are real, posted vouchers.
async function reversingJournal(tenantId, actorId, { entries, voucherDate, reverseDate, narration } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!Array.isArray(entries) || entries.length === 0) throw new PostError("EMPTY_VOUCHER", "entries required", 422);
  const date = voucherDate || new Date().toISOString().slice(0, 10);
  const rDate = reverseDate || date;

  const posted = await postVoucher(tenantId, actorId, {
    voucherType: "JOURNAL", voucherDate: date,
    narration: narration || "Reversing journal", source: "manual",
  }, entries);

  // Mirror: swap each line's debit and credit (balanced by construction).
  const mirror = entries.map((e) => ({
    ledgerId: e.ledgerId,
    debit: toDb(e.credit || 0),
    credit: toDb(e.debit || 0),
    costCentreId: e.costCentreId || null,
    tags: e.tags || null,
  }));
  const reversal = await postVoucher(tenantId, actorId, {
    voucherType: "JOURNAL", voucherDate: rDate,
    narration: `Auto-reversal of ${narration || "reversing journal"}`, source: "manual",
  }, mirror, { reversesVoucherId: posted.voucherId });

  return { posted, reversal };
}

// (2) Voucher templates - store a JSON entries skeleton keyed by name.
async function saveTemplate(tenantId, { name, voucherType, template } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!name) throw new PostError("BAD_INPUT", "name required", 400);
  if (!voucherType) throw new PostError("BAD_INPUT", "voucherType required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_voucher_templates(tenant_id, name, voucher_type, template)
       VALUES($1,$2,$3,$4::jsonb)
     ON CONFLICT(tenant_id, name)
       DO UPDATE SET voucher_type=EXCLUDED.voucher_type, template=EXCLUDED.template
     RETURNING id, name, voucher_type, template, created_at`,
    [tenantId, name, voucherType, JSON.stringify(template || [])]
  );
  return rows[0];
}

async function listTemplates(tenantId) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const { rows } = await pool.query(
    `SELECT id, name, voucher_type, template, created_at
       FROM book_voucher_templates WHERE tenant_id=$1 ORDER BY name ASC`,
    [tenantId]
  );
  return rows;
}

async function deleteTemplate(tenantId, id) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!id) throw new PostError("BAD_INPUT", "id required", 400);
  const { rowCount } = await pool.query(
    "DELETE FROM book_voucher_templates WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  );
  if (!rowCount) throw new PostError("NOT_FOUND", "Template not found", 404);
  return { deleted: true, id };
}

// (3) Post-dated cheques - register a cheque now, post the real voucher on clearing.
async function createPdc(tenantId, { kind, partyLedgerId, bankLedgerId, amount, chequeNo, chequeDate, note } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const k = kind || "RECEIVABLE";
  if (k !== "RECEIVABLE" && k !== "PAYABLE") throw new PostError("BAD_INPUT", "kind must be RECEIVABLE or PAYABLE", 422);
  if (!partyLedgerId || !bankLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId and bankLedgerId required", 422);
  if (!money(amount || 0).greaterThan(0)) throw new PostError("BAD_INPUT", "amount must be positive", 422);
  const { rows } = await pool.query(
    `INSERT INTO book_pdc(tenant_id, kind, party_ledger_id, bank_ledger_id, amount, cheque_no, cheque_date, status, note)
       VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)
     RETURNING id, kind, party_ledger_id, bank_ledger_id, amount, cheque_no, cheque_date, status, cleared_voucher_id, note, created_at`,
    [tenantId, k, partyLedgerId, bankLedgerId, toDb(amount), chequeNo || null, chequeDate || null, note || null]
  );
  return rows[0];
}

async function listPdc(tenantId, status) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const params = [tenantId];
  let sql = `SELECT id, kind, party_ledger_id, bank_ledger_id, amount, cheque_no, cheque_date, status, cleared_voucher_id, note, created_at
               FROM book_pdc WHERE tenant_id=$1`;
  if (status) { params.push(status); sql += ` AND status=$2`; }
  sql += ` ORDER BY cheque_date ASC NULLS LAST, created_at ASC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Clearing posts the real cash movement: RECEIVABLE → RECEIPT (Dr bank / Cr party);
// PAYABLE → PAYMENT (Dr party / Cr bank). Idempotent on status.
async function clearPdc(tenantId, actorId, id) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!id) throw new PostError("BAD_INPUT", "id required", 400);
  const { rows } = await pool.query("SELECT * FROM book_pdc WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const pdc = rows[0];
  if (!pdc) throw new PostError("NOT_FOUND", "PDC not found", 404);
  if (pdc.status !== "PENDING") throw new PostError("BAD_STATE", `PDC is ${pdc.status}, only PENDING can be cleared`, 409);

  const amt = toDb(pdc.amount);
  let voucherType, entries, narr;
  if (pdc.kind === "RECEIVABLE") {
    voucherType = "RECEIPT";
    entries = [
      { ledgerId: pdc.bank_ledger_id, debit: amt, credit: "0.0000" },
      { ledgerId: pdc.party_ledger_id, debit: "0.0000", credit: amt },
    ];
    narr = `PDC cleared (receipt) cheque ${pdc.cheque_no || ""}`.trim();
  } else {
    voucherType = "PAYMENT";
    entries = [
      { ledgerId: pdc.party_ledger_id, debit: amt, credit: "0.0000" },
      { ledgerId: pdc.bank_ledger_id, debit: "0.0000", credit: amt },
    ];
    narr = `PDC cleared (payment) cheque ${pdc.cheque_no || ""}`.trim();
  }

  const posted = await postVoucher(tenantId, actorId, {
    voucherType,
    voucherDate: pdc.cheque_date ? new Date(pdc.cheque_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    narration: narr, partyLedgerId: pdc.party_ledger_id, source: "manual",
  }, entries);

  const { rows: upd } = await pool.query(
    `UPDATE book_pdc SET status='CLEARED', cleared_voucher_id=$3
       WHERE tenant_id=$1 AND id=$2 AND status='PENDING'
     RETURNING id, kind, party_ledger_id, bank_ledger_id, amount, cheque_no, cheque_date, status, cleared_voucher_id, note, created_at`,
    [tenantId, id, posted.voucherId]
  );
  if (!upd[0]) throw new PostError("BAD_STATE", "PDC changed state during clearing", 409);
  return { pdc: upd[0], posted };
}

async function bouncePdc(tenantId, id) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!id) throw new PostError("BAD_INPUT", "id required", 400);
  const { rows } = await pool.query("SELECT status FROM book_pdc WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "PDC not found", 404);
  if (rows[0].status !== "PENDING") throw new PostError("BAD_STATE", `PDC is ${rows[0].status}, only PENDING can bounce`, 409);
  const { rows: upd } = await pool.query(
    `UPDATE book_pdc SET status='BOUNCED' WHERE tenant_id=$1 AND id=$2 AND status='PENDING'
     RETURNING id, kind, party_ledger_id, bank_ledger_id, amount, cheque_no, cheque_date, status, cleared_voucher_id, note, created_at`,
    [tenantId, id]
  );
  if (!upd[0]) throw new PostError("BAD_STATE", "PDC changed state during bounce", 409);
  return upd[0];
}

module.exports = {
  reversingJournal,
  saveTemplate, listTemplates, deleteTemplate,
  createPdc, listPdc, clearPdc, bouncePdc,
};
