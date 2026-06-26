// FinBox enrichment client — bureau + bank-statement-analysis (BSA) data that augments
// Headroom's own scorecard. API-first, dev-friendly (vs enterprise-only Perfios).
//
// HONEST by design: it makes REAL calls only when FINBOX_API_KEY is set, and returns
// { configured:false } otherwise — it never fabricates a bureau score. The exact paths/
// payloads follow FinBox's documented shape; confirm against your contract before going live.

const KEY = () => process.env.FINBOX_API_KEY;
const BASE = () => (process.env.FINBOX_BASE_URL || "https://apis.finbox.in").replace(/\/+$/, "");

function isConfigured() { return !!KEY(); }

// Pull bureau + banking enrichment for an applicant. Returns a normalized shape the
// underwriting engine can blend in, or a clear not-configured / error status. Never throws.
async function enrich({ pan, gstin, mobile, name } = {}) {
  if (!isConfigured()) {
    return { configured: false, note: "Connect FinBox (set FINBOX_API_KEY) to add bureau + bank-statement enrichment." };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch(`${BASE()}/v1/credit/bureau`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY() },
      body: JSON.stringify({ pan: pan || null, gstin: gstin || null, mobile: mobile || null, name: name || null }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      let text; try { text = await resp.text(); } catch { text = ""; }
      return { configured: true, error: `FinBox error ${resp.status}: ${text.slice(0, 200)}` };
    }
    const d = await resp.json();
    // Map FinBox's response to our normalized shape (nulls where absent — never invented).
    return {
      configured: true,
      fetched_at: new Date().toISOString(),
      bureau: {
        score: numOrNull(d.bureau_score ?? d.cibil_score ?? d.score),
        vintage_months: numOrNull(d.vintage_months),
        active_loans: numOrNull(d.active_loans),
        dpd_30plus: numOrNull(d.dpd_30plus ?? d.delinquencies),
      },
      banking: {
        avg_balance: numOrNull(d.avg_balance),
        bounce_rate: numOrNull(d.bounce_rate),
        monthly_inflow: numOrNull(d.monthly_inflow),
      },
    };
  } catch (e) {
    if (e.name === "AbortError") return { configured: true, error: "FinBox request timed out" };
    return { configured: true, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function numOrNull(v) { return v == null || isNaN(Number(v)) ? null : Number(v); }

module.exports = { isConfigured, enrich };
