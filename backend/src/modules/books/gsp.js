// §9.3 - GSP/ASP client for e-invoicing (IRN) and e-way bills. Provider-agnostic
// over a configured GSP base URL + key. Without keys, isConfigured() is false and
// every call returns/throws PENDING_CONFIG (no fake IRNs, no fake cancellations).
const isConfigured = () => !!(process.env.GSP_BASE_URL && process.env.GSP_API_KEY);

const PENDING_CONFIG = "PENDING_CONFIG";
const _pendingConfig = () => { const e = new Error("GSP not configured - set GSP_BASE_URL / GSP_API_KEY"); e.code = PENDING_CONFIG; return e; };

// IRN cancellation is allowed only within 24h of IRN generation (the ack date).
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
// IRP cancel reason codes: 1 = Duplicate, 2 = Data entry mistake. Only 1/2 valid.
const CANCEL_REASON_CODES = new Set([1, 2, "1", "2"]);

// The single network seam: POST `body` to `${GSP_BASE_URL}${path}` with the
// GSP auth headers. Returns PENDING_CONFIG (throws coded error) when creds are
// unset so the build stays real but every live call is gated on credentials.
async function httpCall(path, body) {
  if (!isConfigured()) throw _pendingConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let resp;
  try {
    resp = await fetch(`${process.env.GSP_BASE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.GSP_API_KEY, Authorization: `Bearer ${process.env.GSP_API_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching the GSP");
    throw new Error(`Couldn't reach GSP: ${err.message}`);
  } finally { clearTimeout(timer); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.message || data?.error || `GSP request failed (${resp.status})`);
  return data;
}

// → { irn, ackNo, ackDate, signedQRCode, ... }
const registerInvoice = (payload) => httpCall("/einvoice/register", payload);
// → { ewayBillNo, validUpto, ... }
const generateEwayBill = (payload) => httpCall("/ewaybill/generate", payload);

// Cancel a registered IRN at the IRP. Builds the canonical cancel payload
// (Irn, CnlRsn reason-code 1/2, CnlRem remark) and enforces the 24h window from
// the ack date before touching the network. Returns PENDING_CONFIG when unset.
//   gsp.cancelInvoice(tenantId, { irn, reasonCode, remark, ackDt })
async function cancelInvoice(tenantId, { irn, reasonCode, remark, ackDt } = {}) {
  if (!irn) { const e = new Error("irn required to cancel"); e.code = "BAD_REQUEST"; throw e; }
  if (!CANCEL_REASON_CODES.has(reasonCode)) {
    const e = new Error("CnlRsn must be 1 (Duplicate) or 2 (Data entry mistake)"); e.code = "BAD_REASON_CODE"; throw e;
  }
  // 24h-window enforcement: reject if the IRN ack date is older than 24h.
  if (ackDt != null) {
    const ack = new Date(ackDt);
    if (isNaN(ack.getTime())) { const e = new Error("invalid IRN ack date"); e.code = "NO_ACK_DATE"; throw e; }
    if (Date.now() - ack.getTime() > CANCEL_WINDOW_MS) {
      const e = new Error("24-hour IRN cancellation window has passed"); e.code = "CANCEL_WINDOW_PASSED"; throw e;
    }
  }
  const payload = { Irn: irn, CnlRsn: Number(reasonCode), CnlRem: remark || null };
  // → { irn, cancelDate, status, ... }
  return httpCall("/einvoice/cancel", payload);
}

module.exports = { isConfigured, httpCall, registerInvoice, generateEwayBill, cancelInvoice, CANCEL_WINDOW_MS, PENDING_CONFIG };
