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

// Inject a tiny bootstrap so the (sandboxed) app can call its granted agents via the
// metered bridge: window.HEADROOM.askAgent(agentId, message) → Promise<{reply}>.
// JSON is <-escaped to prevent a name containing </script> from breaking out.
function injectBridge(html, token, agents, bridgeBase) {
  const safe = JSON.stringify(agents || []).replace(/</g, "\\u003c");
  const boot = `<script>window.HEADROOM={appToken:${JSON.stringify(token)},agents:${safe},`
    + `askAgent:function(agentId,message){return fetch(${JSON.stringify(bridgeBase)}+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:agentId,message:message})}).then(function(r){return r.json();});}};</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, boot + "</head>");
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + boot);
  return boot + html;
}

router.get("/:token", async (req, res) => {
  try {
    const app = await studio.getPublished(req.params.token);
    if (!app) return res.status(404).type("html").send("<!doctype html><meta charset=utf-8><title>Not found</title><body style=\"font-family:system-ui;background:#101830;color:#E8EDF6;display:grid;place-items:center;height:100vh;margin:0\"><p>This app link is no longer available.</p>");
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
    const bridgeBase = `${proto}://${req.get("host")}/api/agent-bridge/${req.params.token}`;
    const html = (app.agents && app.agents.length) ? injectBridge(app.html, req.params.token, app.agents, bridgeBase) : app.html;
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
    return res.send(html);
  } catch (e) {
    console.error("[studio-public]", e.message);
    return res.status(500).type("html").send("<!doctype html><meta charset=utf-8><body>Error loading app.");
  }
});

module.exports = router;
