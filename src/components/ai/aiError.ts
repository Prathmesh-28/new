// Turns the raw error thrown by api.post (shape: "<status>: <server body>") into a
// short, actionable message for the AI primitives. The server bubbles the provider's
// own error text through, so we can distinguish "no key" from "out of credits" from
// "rate-limited" - instead of the old catch-all "AI isn't enabled" that hid the real
// cause (e.g. a funded key with a zero-credit OpenRouter balance).
export function humanizeAiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const lower = raw.toLowerCase();

  // Out of credits / billing - the most common "it's set but doesn't work" case.
  if (lower.includes("insufficient credit") || lower.includes(" 402") || lower.includes("(402)") || lower.includes("payment required"))
    return "Your AI engine is out of credits - top up your balance at openrouter.ai/settings/credits, then try again.";

  // No engine configured at all.
  if (lower.includes("llm_not_configured") || lower.includes("connect an llm provider") || lower.startsWith("422"))
    return "AI isn't connected yet - add your engine key (OPENROUTER_API_KEY) or set one in Books → AI Agents.";

  // Bad / revoked key.
  if (lower.includes(" 401") || lower.includes("(401)") || lower.includes("unauthorized") || (lower.includes("invalid") && lower.includes("key")))
    return "Your AI engine rejected the key - check it's correct and still active.";

  // Rate limited.
  if (lower.includes(" 429") || lower.includes("(429)") || lower.includes("rate limit") || lower.includes("rate-limit"))
    return "The AI engine is rate-limited right now - wait a moment and try again.";

  // Unknown / not-found model.
  if (lower.includes("not a valid model") || lower.includes("model not found") || (lower.includes("model") && lower.includes("404")))
    return "The configured AI model isn't available on your engine - pick a valid model in Books → AI Agents.";

  // Otherwise surface the provider's own message if we can dig it out of the JSON.
  const m = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (m && m[1]) return `AI engine error: ${m[1]}`;

  return "Couldn't reach the AI engine - check the engine key and credits, then try again.";
}
