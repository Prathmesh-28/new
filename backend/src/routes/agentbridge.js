// Agent bridge (Headroom Studio P6 — the wedge): lets a PUBLISHED App Builder app
// call the Agent Studio agents its project has granted. NO Headroom auth — the app
// token is the capability, scoped to exactly the agents granted to that project.
// Mounted at /api/agent-bridge.
//
// Safety: runs the agent READ-ONLY (actorId null → any write action becomes a pending
// approval and is NOT executed), returns ONLY the reply text (never internal steps /
// tool args), is per-token rate-limited (the tenant's LLM tokens are real money), and
// is covered by the tenant's monthly token cap.

const router = require("express").Router();
const studio = require("../modules/studio");
const { agents } = require("../modules/books");

// The published app runs sandboxed (Origin: null), so allow any origin — the token,
// not the origin, is the capability.
router.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Crude in-memory per-token sliding-window limiter (protects against public abuse
// burning the tenant's LLM credits). Process-local is fine for this guardrail.
const hits = new Map();
function rateLimited(key, max = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}

router.post("/:appToken/chat", async (req, res) => {
  try {
    const token = req.params.appToken;
    const b = req.body || {};
    const message = String(b.message || "").slice(0, 4000);
    const agentId = b.agentId;
    if (!message) return res.status(400).json({ error: "message required" });
    if (rateLimited(token, 20, 60000)) return res.status(429).json({ error: "Too many requests — please slow down." });
    const grant = await studio.resolveBridgeGrant(token, agentId);
    if (!grant) return res.status(403).json({ error: "This app isn't allowed to use that agent." });
    const out = await agents.runAgent(grant.tenantId, null, agentId, message); // read-only; metered; cap-guarded
    return res.json({ reply: out && out.reply ? out.reply : "" }); // reply only — never internal steps
  } catch (e) {
    if (e && e.http) return res.status(e.http).json({ error: e.message, code: e.code });
    console.error("[agent-bridge]", e.message);
    return res.status(500).json({ error: "The agent is unavailable right now." });
  }
});

module.exports = router;
