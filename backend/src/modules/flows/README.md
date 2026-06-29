# Flows — native workflow automation engine (`/api/flows`)

An in-app, **n8n-independent** workflow/automation engine and the app's lightweight BRE (business-rule engine). A flow is a trigger + a node graph; the runner does a topological walk with branch reachability and `{{path}}` templating.

**Triggers:** manual · schedule (cron) · webhook (`POST /webhook/:token`, public) · event (`invoice.paid`, `cash.daily`, …). Events are emitted via `runner.emitEvent(tenantId, name, payload)` from anywhere in the backend (an AsyncLocalStorage guard prevents re-entrancy).

**Node types:** tool · llm · agent · http · branch · set · notify · whatsapp · email · underwrite (runs the credit scorecard). Crons: `runDueScheduled`, `runDailyCashEvents`.

**Files:** `index.js` (data layer) · `runner.js` (the engine) · `templates.js` (starter flows) · `http.js` · `schema.js`.

**Tables:** `flows`, `flow_runs`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
