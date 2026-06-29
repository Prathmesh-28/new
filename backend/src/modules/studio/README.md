# Studio — App Builder (`/api/studio`)

A Lovable/Emergent-style **app builder**: describe an app in plain English → an LLM codegen agent generates a self-contained app → version it → publish to a token-served URL. Runs codegen on the tenant's own LLM engine (the `books/llm.js` gateway). Apps can be granted scoped access to Agent Studio agents (the agent-bridge "wedge").

**Files:** `index.js` (projects/versions/deployments data layer, tenant-scoped, keyset-paginated) · `codegen.js` (LLM codegen orchestration) · `http.js` · `schema.js`. Published apps are served publicly by `routes/studiopublic.js` at `/api/pub`.

**Key routes:** projects + versions CRUD, `POST /projects/:id/generate`, `POST /projects/:id/restore/:versionId`, `POST /projects/:id/publish`, app-agent grants.

**Tables:** `studio_projects`, `studio_project_versions`, `studio_deployments`, `studio_app_agents`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
