// §M2 — BILL-WISE SETTLEMENT. Turns book_allocations from an advisory link into
// a validated open-bill settlement layer. The ledger movement is already posted
// by the posting-engine; this layer answers "which advance/credit/payment offsets
// which invoice/bill, and by how much" — and refuses to over-allocate, cross
// parties, or apply more than a source actually carries.
//
// Approach ported from ERPNext Payment Entry reference allocation + AR/AP aging
// (frappe/erpnext erpnext/accounts/doctype/payment_entry): a "bill" is the party
// debit (SALES) or credit (PURCHASE); outstanding = gross − Σ allocations; an
// allocation can never exceed the bill's outstanding nor the source's unapplied
// amount. We hold FOR UPDATE on the involved vouchers so concurrent allocations
// cannot both consume the same headroom.
const { pool } = require("../../db");
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

// gross side per voucher type: SALES bills sit as a party DEBIT (receivable),
// PURCHASE bills as a party CREDIT (payable).
function grossSideExpr(alias) {
  // returns SQL summing the correct side of the party-ledger entry on the voucher
  return `CASE WHEN ${alias}.voucher_type='SALES'
               THEN COALESCE((SELECT SUM(e.debit)  FROM book_voucher_entries e WHERE e.voucher_id=${alias}.id AND e.ledger_id=${alias}.party_ledger_id),0)
               ELSE COALESCE((SELECT SUM(e.credit) FROM book_voucher_entries e WHERE e.voucher_id=${alias}.id AND e.ledger_id=${alias}.party_ledger_id),0)
          END`;
}

// (1) Open bills for a party — SALES/PURCHASE vouchers with outstanding>0, oldest first.
async function openBills(tenantId, partyLedgerId) {
  if (!tenantId || !partyLedgerId) throw new PostError("BAD_INPUT", "tenantId and partyLedgerId required", 400);
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date,
            COALESCE(pl.credit_period_days,0) AS credit_period_days,
            ${grossSideExpr("v")} AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
       LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.party_ledger_id=$2
        AND v.voucher_type IN ('SALES','PURCHASE') AND v.is_cancelled=false
      ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
    [tenantId, partyLedgerId]
  );
  const today = Date.now();
  const out = [];
  for (const r of rows) {
    const gross = money(r.gross);
    const allocated = money(r.allocated);
    const outstanding = gross.minus(allocated);
    if (!outstanding.greaterThan(0)) continue; // settled / nothing owed
    const creditDays = Number(r.credit_period_days) || 0;
    const dueMs = new Date(r.voucher_date).getTime() + creditDays * 86400000;
    const dueDate = new Date(dueMs).toISOString().slice(0, 10);
    const daysOverdue = Math.max(0, Math.round((today - dueMs) / 86400000));
    out.push({
      voucherId: r.id,
      voucherType: r.voucher_type,
      number: r.voucher_number,
      date: r.voucher_date,
      dueDate,
      gross: toRupees(gross),
      allocated: toRupees(allocated),
      outstanding: toRupees(outstanding),
      daysOverdue,
    });
  }
  return out;
}

// (2) Validated allocation — settle `amount` of a source advance/credit/payment
// against a target invoice/bill, inside a serialized transaction.
async function allocateBill(tenantId, { sourceVoucherId, targetVoucherId, amount } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!sourceVoucherId || !targetVoucherId) throw new PostError("BAD_INPUT", "sourceVoucherId and targetVoucherId required", 400);
  if (sourceVoucherId === targetVoucherId) throw new PostError("BAD_INPUT", "Source and target cannot be the same voucher", 422);
  const amt = money(amount);
  if (!amt.greaterThan(0)) throw new PostError("BAD_AMOUNT", "Allocation amount must be positive", 422);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock both vouchers so concurrent allocations cannot double-spend headroom.
    const { rows: vrows } = await client.query(
      `SELECT id, voucher_type, party_ledger_id, is_cancelled
         FROM book_vouchers
        WHERE tenant_id=$1 AND id IN ($2,$3)
        FOR UPDATE`,
      [tenantId, sourceVoucherId, targetVoucherId]
    );
    const src = vrows.find((v) => v.id === sourceVoucherId);
    const tgt = vrows.find((v) => v.id === targetVoucherId);
    if (!src) throw new PostError("NOT_FOUND", "Source voucher not found", 404);
    if (!tgt) throw new PostError("NOT_FOUND", "Target voucher not found", 404);
    if (src.is_cancelled) throw new PostError("CANCELLED", "Source voucher is cancelled", 409);
    if (tgt.is_cancelled) throw new PostError("CANCELLED", "Target voucher is cancelled", 409);

    // Same party on both sides.
    if (!src.party_ledger_id || !tgt.party_ledger_id || src.party_ledger_id !== tgt.party_ledger_id) {
      throw new PostError("CROSS_PARTY", "Source and target belong to different parties", 422);
    }
    if (!(tgt.voucher_type === "SALES" || tgt.voucher_type === "PURCHASE")) {
      throw new PostError("BAD_TARGET", "Target must be a SALES or PURCHASE bill", 422);
    }

    // Target outstanding = gross(party side) − Σ allocations against it.
    const tgtSide = tgt.voucher_type === "SALES" ? "debit" : "credit";
    const { rows: tg } = await client.query(
      `SELECT COALESCE((SELECT SUM(e.${tgtSide}) FROM book_voucher_entries e WHERE e.voucher_id=$2 AND e.ledger_id=$3),0) AS gross,
              COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=$1 AND a.target_voucher_id=$2),0) AS allocated`,
      [tenantId, targetVoucherId, tgt.party_ledger_id]
    );
    const tgtOutstanding = money(tg[0].gross).minus(tg[0].allocated);
    if (!tgtOutstanding.greaterThan(0)) throw new PostError("BILL_SETTLED", "Target bill has no outstanding amount", 422);
    if (amt.greaterThan(tgtOutstanding)) {
      throw new PostError("OVER_ALLOCATION", `Amount ${toRupees(amt)} exceeds bill outstanding ${toRupees(tgtOutstanding)}`, 422);
    }

    // Source available = its party-ledger movement (the OPPOSITE side of the bill)
    // − amount already applied from this source. A SALES bill is a receivable
    // (party debit); the source that settles it carries a party credit
    // (RECEIPT / CREDIT_NOTE). For a PURCHASE bill it is the reverse.
    const srcSide = tgt.voucher_type === "SALES" ? "credit" : "debit";
    const { rows: sg } = await client.query(
      `SELECT COALESCE((SELECT SUM(e.${srcSide}) FROM book_voucher_entries e WHERE e.voucher_id=$2 AND e.ledger_id=$3),0) AS capacity,
              COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=$1 AND a.source_voucher_id=$2),0) AS applied`,
      [tenantId, sourceVoucherId, src.party_ledger_id]
    );
    const srcAvailable = money(sg[0].capacity).minus(sg[0].applied);
    if (!srcAvailable.greaterThan(0)) throw new PostError("NO_SOURCE_FUNDS", "Source voucher has no unallocated amount on this party", 422);
    if (amt.greaterThan(srcAvailable)) {
      throw new PostError("OVER_ALLOCATION", `Amount ${toRupees(amt)} exceeds source available ${toRupees(srcAvailable)}`, 422);
    }

    await client.query(
      `INSERT INTO book_allocations(tenant_id, source_voucher_id, target_voucher_id, amount)
       VALUES($1,$2,$3,$4)`,
      [tenantId, sourceVoucherId, targetVoucherId, toDb(amt)]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      targetOutstanding: toRupees(tgtOutstanding.minus(amt)),
      sourceAvailable: toRupees(srcAvailable.minus(amt)),
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { openBills, allocateBill };
