// Structured JSON logger → stdout/stderr (captured by Render's log pipeline).
// One line per event so logs are greppable and aggregator-friendly. This is the
// single seam to forward to Sentry/Datadog later: wire it inside error() once a
// DSN exists, and every error() call across the app starts shipping.
function emit(level, msg, meta) {
  const line = { t: new Date().toISOString(), level, msg };
  if (meta && typeof meta === "object") Object.assign(line, meta);
  else if (meta !== undefined) line.meta = meta;
  const out = JSON.stringify(line) + "\n";
  if (level === "error") process.stderr.write(out);
  else process.stdout.write(out);
}

module.exports = {
  info:  (msg, meta) => emit("info", msg, meta),
  warn:  (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
};
