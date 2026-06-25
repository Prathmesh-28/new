// Public serving for Headroom Studio published apps (App Builder, v1 publish).
// NO authentication — addressed by an unguessable token. Mounted at /api/pub.
//
// Generated app HTML is UNTRUSTED model output, so it is served sandboxed: the CSP
// `sandbox` directive (without allow-same-origin) puts the document in a unique
// opaque origin, so its scripts can run for interactivity but cannot read our
// cookies/storage or touch any Headroom origin. nosniff + no-referrer harden it
// further. (The in-app preview iframe applies the same isolation via sandbox=.)

const router = require("express").Router();
const studio = require("../modules/studio");

router.get("/:token", async (req, res) => {
  try {
    const app = await studio.getPublished(req.params.token);
    if (!app) return res.status(404).type("html").send("<!doctype html><meta charset=utf-8><title>Not found</title><body style=\"font-family:system-ui;background:#101830;color:#E8EDF6;display:grid;place-items:center;height:100vh;margin:0\"><p>This app link is no longer available.</p>");
    // The global securityHeaders middleware set X-Frame-Options: DENY + a strict CSP
    // on this response; replace them so the published app can be embedded (it stays
    // isolated via the CSP `sandbox` directive — a unique opaque origin, scripts but
    // no same-origin access — so framing it is safe).
    res.removeHeader("X-Frame-Options");
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "public, max-age=60",
    });
    return res.send(app.html);
  } catch (e) {
    console.error("[studio-public]", e.message);
    return res.status(500).type("html").send("<!doctype html><meta charset=utf-8><body>Error loading app.");
  }
});

module.exports = router;
