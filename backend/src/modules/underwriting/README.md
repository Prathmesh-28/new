# Underwriting — agentic credit engine (library, not a route)

A multi-agent SMB credit-underwriting engine (LangGraph/FastMCP pattern, **ported to Node**). Unlike the other modules this has **no `http.js`/`schema.js`** — it's a library called by `routes/credit.js` at **`POST /api/credit/underwrite-agentic`**.

**Shape:** `intake → [creditworthiness ∥ fraud ∥ repayment ∥ sector-macro] → deterministic decision (0.4/0.3/0.2/0.1; ≥70 pre-qualified / ≥50 refer / else declined) → LLM explanation → LLM audit → policy-clamped offer`.

**Invariants (don't break — covered by `agentEngine.test.js`):**
- The **LLM never decides** — scores + decision are 100% deterministic.
- The **fraud agent is deterministic** (no randomness).
- The **offer is policy-clamped** (rate 12–30%, limit ≤30% turnover, tenure pinned to band).
- Caller free-text is **stripped from LLM prompts** (injection guard).
- Runs **offline** via templated fallbacks; report stamps `source` (tenant_books vs caller_asserted_unverified).

Note: the deterministic scorecard it builds on lives in `backend/src/lib/underwriting.js` (`score()`), also used directly by `/api/credit/score`, `/report`, and the `lending` module's eligibility.

**Files:** `agentEngine.js` · `agentEngine.test.js` (run: `node src/modules/underwriting/agentEngine.test.js`).

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for conventions.
