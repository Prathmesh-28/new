// §9.3 — GSP/ASP client for e-invoicing (IRN) and e-way bills. Provider-agnostic
// over a configured GSP base URL + key. Without keys, isConfigured() is false and
// the e-invoice worker parks the voucher as PENDING_CONFIG (no fake IRNs).
const isConfigured = () => !!(process.env.GSP_BASE_URL && process.env.GSP_API_KEY);

async function _post(path, payload) {
  if (!isConfigured()) { const e = new Error("GSP not configured"); e.code = "PENDING_CONFIG"; throw e; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let resp;
  try {
    resp = await fetch(`${process.env.GSP_BASE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.GSP_API_KEY },
      body: JSON.stringify(payload),
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
const registerInvoice = (payload) => _post("/einvoice/register", payload);
// → { ewayBillNo, validUpto, ... }
const generateEwayBill = (payload) => _post("/ewaybill/generate", payload);

module.exports = { isConfigured, registerInvoice, generateEwayBill };
