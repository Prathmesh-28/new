// Structured JSON logger → stdout/stderr (captured by Render's log pipeline).
// One line per event so logs are greppable and aggregator-friendly. This is the
// single seam to forward to Sentry/Datadog later: wire it inside error() once a
// DSN exists, and every error() call across the app starts shipping.
function emit(level, msg, meta) {
  const line = { t: new Date().toISOString(), level, msg };
  if (meta && typeof meta === "object") Object.assign(line, meta);
  else if (meta !== undefined) line.meta = meta;
  const out = JSON.stringify(line) + "\n";
  if (level === "error") { process.stderr.write(out); forward(line); }
  else process.stdout.write(out);
}

// Gated, provider-agnostic error forwarding. No-op until ERROR_WEBHOOK_URL is set
// (e.g. a Sentry/Slack/Datadog/collector intake). Fire-and-forget; never throws and
// never blocks the request. This is the seam — point it at a DSN and errors ship.
let forwarding = false; // recursion guard: an error while forwarding must not re-forward
function forward(line) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url || forwarding) return;
  try {
    forwarding = true;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000); if (t.unref) t.unref();
    const body = JSON.stringify({ service: "headroom-backend", env: process.env.NODE_ENV || "production", ...line });
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: ac.signal })
      .catch(() => {}).finally(() => { clearTimeout(t); forwarding = false; });
  } catch { forwarding = false; /* logging must never break the caller */ }
}

module.exports = {
  info:  (msg, meta) => emit("info", msg, meta),
  warn:  (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
};
