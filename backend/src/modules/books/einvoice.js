// §9.3 — e-invoice generation, async. enqueue() parks a QUEUED row; a DB-polling
// worker (durable across restarts — no Redis needed) builds the IRP payload and
// registers it with the GSP. Swap startWorker() for a BullMQ worker when Redis exists.
const { pool } = require("../../db");
const { toRupees } = require("./money");
const gsp = require("./gsp");

// Build a minimal IRP-shaped payload from a voucher + its tax lines (pure).
function buildIrpPayload(voucher, taxes, sellerProfile, buyerLedger) {
  const taxable = taxes.filter((t) => ["CGST", "IGST"].includes(t.tax_kind)).reduce((s, t) => s + Number(t.taxable_value || 0), 0);
  const tax = taxes.reduce((s, t) => s + Number(t.tax_amount || 0), 0);
  return {
    docNo: `${voucher.voucher_type}-${voucher.voucher_number}`,
    docDate: voucher.voucher_date,
    seller: { gstin: sellerProfile?.gstin || null, legalName: sellerProfile?.legal_name || sellerProfile?.company_name || null, stateCode: sellerProfile?.state || null },
    buyer: { gstin: buyerLedger?.gstin || null, legalName: buyerLedger?.name || null, stateCode: buyerLedger?.state_code || null },
    value: { taxable: toRupees(taxable), tax: toRupees(tax), total: toRupees(taxable + tax) },
    items: taxes.map((t) => ({ hsnSac: t.hsn_sac, rate: t.rate, taxable: toRupees(t.taxable_value), tax: toRupees(t.tax_amount), kind: t.tax_kind })),
  };
}

async function enqueue(tenantId, voucherId) {
  await pool.query(
    "INSERT INTO book_einvoices(voucher_id,tenant_id,status) VALUES($1,$2,'QUEUED') ON CONFLICT(voucher_id) DO UPDATE SET status='QUEUED', error=NULL, updated_at=now()",
    [voucherId, tenantId]
  );
  return { voucherId, status: "QUEUED" };
}

async function _processVoucher(tenantId, voucherId) {
  const { rows: vr } = await pool.query("SELECT * FROM book_vouchers WHERE id=$1", [voucherId]);
  const voucher = vr[0];
  if (!voucher) { await _set(voucherId, "FAILED", { error: "voucher gone" }); return; }
  const { rows: taxes } = await pool.query("SELECT * FROM book_tax_entries WHERE voucher_id=$1 AND is_input=false", [voucherId]);
  const { rows: prof } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const { rows: buyer } = voucher.party_ledger_id ? await pool.query("SELECT name, gstin, state_code FROM book_ledgers WHERE id=$1", [voucher.party_ledger_id]) : [{}];
  const payload = buildIrpPayload(voucher, taxes, prof[0], buyer[0]);
  try {
    if (!gsp.isConfigured()) { await _set(voucherId, "PENDING_CONFIG", { error: "GSP not configured — set GSP_BASE_URL / GSP_API_KEY" }); return; }
    const res = await gsp.registerInvoice(payload);
    await pool.query("UPDATE book_einvoices SET status='REGISTERED', irn=$2, ack_no=$3, ack_date=$4, signed_qr=$5, error=NULL, updated_at=now() WHERE voucher_id=$1",
      [voucherId, res.irn || null, res.ackNo || null, res.ackDate || null, res.signedQRCode || null]);
  } catch (e) {
    await _set(voucherId, e.code === "PENDING_CONFIG" ? "PENDING_CONFIG" : "FAILED", { error: e.message });
  }
}
async function _set(voucherId, status, { error } = {}) {
  await pool.query("UPDATE book_einvoices SET status=$2, error=$3, updated_at=now() WHERE voucher_id=$1", [voucherId, status, error || null]);
}

// DB-polling worker. Picks up QUEUED rows; PENDING_CONFIG rows are retried only
// when the GSP becomes configured (cheap to re-run).
let _timer = null;
function startWorker(intervalMs = 5000) {
  if (_timer) return;
  _timer = setInterval(async () => {
    try {
      const cond = gsp.isConfigured() ? "status IN ('QUEUED','PENDING_CONFIG')" : "status='QUEUED'";
      const { rows } = await pool.query(`SELECT voucher_id, tenant_id FROM book_einvoices WHERE ${cond} ORDER BY updated_at LIMIT 5`);
      for (const r of rows) await _processVoucher(r.tenant_id, r.voucher_id);
    } catch (e) { console.error("[einvoice]", e.message); }
  }, intervalMs);
  if (_timer.unref) _timer.unref();
}

async function status(tenantId, voucherId) {
  const { rows } = await pool.query("SELECT * FROM book_einvoices WHERE tenant_id=$1 AND voucher_id=$2", [tenantId, voucherId]);
  return rows[0] || { voucher_id: voucherId, status: "NONE" };
}

module.exports = { buildIrpPayload, enqueue, status, startWorker };
