# Collab — Teams-style team chat (`/api/collab`)

Internal messaging: teams, channels/DMs, messages, reactions, @mentions, threads, pinned messages, contextual links to financial objects, and per-user notifications. Real-time delivery via SSE (`GET /stream`) + polling fallback.

**Tenant isolation is enforced at the DB**, not just the app layer: every function runs through `withTenant()` (`tenantContext.js`), which opens a transaction with the `app.current_tenant` GUC set so **FORCE row-level security** kicks in. PKs are time-sortable `collab_uuidv7()` for clean keyset pagination.

**Files:** `index.js` (data layer, all via `withTenant()`) · `http.js` (REST + SSE) · `schema.js` · `tenantContext.js` (RLS/GUC wrapper) · `contract.js` (shared request/response shapes).

**Tables:** `collab_teams`, `collab_team_members`, `collab_conversations`, `collab_conversation_members`, `collab_messages`, `collab_message_attachments`, `collab_message_reactions`, `collab_message_mentions`, `collab_pinned_messages`, `collab_contextual_links`, `collab_notifications`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
