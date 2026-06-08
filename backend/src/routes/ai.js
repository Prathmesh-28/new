const router = require("express").Router();
const { authenticate } = require("../middleware/auth");

// POST /api/ai/ask — proxies to Claude
router.post("/ask", authenticate, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "AI not configured" });
  }

  const { messages, system } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "messages required" });

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic.default();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: system || "You are a financial operations assistant for a small business. Be concise and actionable.",
      messages,
    });
    res.json({ content: resp.content[0]?.text ?? "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
