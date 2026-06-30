// §M8 - receipt OCR hook. Provider-agnostic; env-gated. Without a provider it
// returns a clean manual-entry fallback (no fake extraction).
const isConfigured = () => !!(process.env.OCR_PROVIDER_URL && process.env.OCR_API_KEY);

async function parseReceipt({ imageUrl }) {
  if (!isConfigured()) {
    return { parsed: false, note: "OCR provider not configured - enter the expense manually, or set OCR_PROVIDER_URL / OCR_API_KEY to auto-extract amount, date and vendor." };
  }
  try {
    const resp = await fetch(process.env.OCR_PROVIDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.OCR_API_KEY },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { parsed: false, note: `OCR failed (${resp.status})` };
    return { parsed: true, amount: data.amount ?? null, date: data.date ?? null, vendor: data.vendor ?? null, raw: data };
  } catch (e) {
    return { parsed: false, note: `OCR error: ${e.message}` };
  }
}

module.exports = { isConfigured, parseReceipt };
