// Security response headers for the JSON API. This backend only ever returns
// JSON (the SPA is served by Vercel), so the CSP can be maximally strict.
// Dependency-free on purpose - no helmet, nothing to install or version-pin.
function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // API responses never load or embed anything.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  // Only assert HSTS over real TLS (Render/Vercel terminate HTTPS upstream).
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

module.exports = { securityHeaders };
