// Headroom Studio — App Builder, Phase 0 data layer.
//
// Every function takes tenantId first and filters by it (app-layer tenant
// isolation — the books/crm norm; a cross-tenant test guards it). Lists use
// keyset pagination on the time-sortable collab_uuidv7() id: pass `before` (a
// cursor id) to page backwards through `ORDER BY id DESC`.

const { pool } = require("../../db");

class StudioError extends Error {
  constructor(code, message, http = 400) {
    super(message);
    this.code = code;
    this.http = http;
  }
}

const PAGE_MAX = 100;
const clampLimit = (n) => Math.min(Math.max(parseInt(n, 10) || 30, 1), PAGE_MAX);

// kebab-case slug from a name; falls back to "app" if empty after stripping.
function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "app";
}

// A slug unique within the tenant: append -2, -3, … on collision.
async function uniqueSlug(tenantId, name) {
  const base = slugify(name);
  const { rows } = await pool.query(
    "SELECT slug FROM studio_projects WHERE tenant_id=$1 AND (slug=$2 OR slug LIKE $3)",
    [tenantId, base, base + "-%"]
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

async function createProject(tenantId, createdBy, { name } = {}) {
  const projName = String(name || "").trim() || "Untitled app";
  let slug = await uniqueSlug(tenantId, projName);
  // Retry on a unique-slug race: uniqueSlug → INSERT is not atomic, so a concurrent
  // create of the same name can collide on UNIQUE(tenant_id, slug). The DB constraint
  // protects integrity; here we just recover with a random suffix instead of erroring.
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: pr } = await client.query(
        `INSERT INTO studio_projects(tenant_id, name, slug, created_by)
         VALUES($1,$2,$3,$4) RETURNING *`,
        [tenantId, projName, slug, createdBy || null]
      );
      const project = pr[0];
      // Seed an empty initial version so every project always has a current version.
      const { rows: vr } = await client.query(
        `INSERT INTO studio_project_versions(project_id, tenant_id, file_tree, summary, created_by)
         VALUES($1,$2,'{}'::jsonb,'Empty project',$3) RETURNING *`,
        [project.id, tenantId, createdBy || null]
      );
      await client.query("UPDATE studio_projects SET current_version_id=$1 WHERE id=$2", [vr[0].id, project.id]);
      await client.query("COMMIT");
      return { ...project, current_version_id: vr[0].id, current_version: vr[0] };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      if (e.code === "23505" && attempt < 3) { slug = `${slugify(projName)}-${require("crypto").randomBytes(3).toString("hex")}`; continue; }
      throw e;
    } finally {
      client.release();
    }
  }
}

async function listProjects(tenantId, { limit, before } = {}) {
  const lim = clampLimit(limit);
  const params = [tenantId];
  let where = "tenant_id=$1 AND archived_at IS NULL";
  if (before) { params.push(before); where += ` AND id < $${params.length}`; }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT id, name, slug, current_version_id, created_at, updated_at
       FROM studio_projects
      WHERE ${where}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );
  return { projects: rows, nextCursor: rows.length === lim ? rows[rows.length - 1].id : null };
}

async function getProject(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM studio_projects WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new StudioError("NOT_FOUND", "Project not found", 404);
  const project = rows[0];
  let current_version = null;
  if (project.current_version_id) {
    const { rows: v } = await pool.query(
      "SELECT * FROM studio_project_versions WHERE tenant_id=$1 AND id=$2",
      [tenantId, project.current_version_id]
    );
    current_version = v[0] || null;
  }
  return { ...project, current_version };
}

async function updateProject(tenantId, id, patch = {}) {
  const sets = [];
  const params = [tenantId, id];
  if (typeof patch.name === "string") { params.push(patch.name.trim() || "Untitled app"); sets.push(`name=$${params.length}`); }
  if (typeof patch.archived === "boolean") sets.push(`archived_at=${patch.archived ? "now()" : "NULL"}`);
  if (!sets.length) return getProject(tenantId, id);
  sets.push("updated_at=now()");
  const { rows } = await pool.query(
    `UPDATE studio_projects SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new StudioError("NOT_FOUND", "Project not found", 404);
  return rows[0];
}

async function createVersion(tenantId, projectId, createdBy, { file_tree, prompt, summary, parent_version_id } = {}) {
  // Ownership check (also enforces tenant scope).
  const { rows: pr } = await pool.query("SELECT id, current_version_id FROM studio_projects WHERE tenant_id=$1 AND id=$2", [tenantId, projectId]);
  if (!pr[0]) throw new StudioError("NOT_FOUND", "Project not found", 404);
  const tree = file_tree && typeof file_tree === "object" ? file_tree : {};
  const parent = parent_version_id || pr[0].current_version_id || null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO studio_project_versions(project_id, tenant_id, parent_version_id, file_tree, prompt, summary, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [projectId, tenantId, parent, JSON.stringify(tree), prompt || null, summary || null, createdBy || null]
    );
    await client.query("UPDATE studio_projects SET current_version_id=$1, updated_at=now() WHERE id=$2", [rows[0].id, projectId]);
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function listVersions(tenantId, projectId, { limit, before } = {}) {
  const lim = clampLimit(limit);
  const params = [tenantId, projectId];
  let where = "tenant_id=$1 AND project_id=$2";
  if (before) { params.push(before); where += ` AND id < $${params.length}`; }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT id, project_id, parent_version_id, prompt, summary, created_by, created_at
       FROM studio_project_versions
      WHERE ${where}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );
  return { versions: rows, nextCursor: rows.length === lim ? rows[rows.length - 1].id : null };
}

async function getVersion(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM studio_project_versions WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new StudioError("NOT_FOUND", "Version not found", 404);
  return rows[0];
}

// Restore a past version by appending a NEW version that copies its file tree
// (history stays append-only) and making it current. Returns the new version.
async function restoreVersion(tenantId, projectId, versionId) {
  const src = await getVersion(tenantId, versionId);  // throws NOT_FOUND across tenants/projects
  if (src.project_id !== projectId) throw new StudioError("NOT_FOUND", "Version not in this project", 404);
  return createVersion(tenantId, projectId, src.created_by, {
    file_tree: src.file_tree,
    prompt: src.prompt,
    summary: `Restored from an earlier version`,
    parent_version_id: src.id,
  });
}

// Publish the project's CURRENT version to a public, token-addressed URL. Re-publishing
// reuses the project's existing token (stable shareable link) and just points it at the
// latest version. Returns { token, path, deployment }.
async function publish(tenantId, projectId) {
  const project = await getProject(tenantId, projectId);
  if (!project.current_version_id) throw new StudioError("NOTHING_TO_PUBLISH", "Build the app first", 422);
  const { rows: existing } = await pool.query(
    "SELECT * FROM studio_deployments WHERE tenant_id=$1 AND project_id=$2 AND token IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [tenantId, projectId]
  );
  const token = existing[0]?.token || ("app_" + require("crypto").randomBytes(12).toString("hex"));
  const path = `/api/pub/${token}`;
  let deployment;
  if (existing[0]) {
    const { rows } = await pool.query(
      "UPDATE studio_deployments SET version_id=$1, url=$2, status='live', updated_at=now() WHERE id=$3 RETURNING *",
      [project.current_version_id, path, existing[0].id]
    );
    deployment = rows[0];
  } else {
    const { rows } = await pool.query(
      "INSERT INTO studio_deployments(project_id, tenant_id, version_id, token, url, status) VALUES($1,$2,$3,$4,$5,'live') RETURNING *",
      [projectId, tenantId, project.current_version_id, token, path]
    );
    deployment = rows[0];
  }
  return { token, path, deployment };
}

// Public (no tenant scope — addressed by an unguessable token). Returns the published
// app's HTML + name + the agents it may embed (for the bridge bootstrap), or null.
async function getPublished(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT d.project_id, p.name, v.file_tree
       FROM studio_deployments d
       JOIN studio_projects p ON p.id = d.project_id
       JOIN studio_project_versions v ON v.id = d.version_id
      WHERE d.token=$1 AND d.status='live'
      LIMIT 1`,
    [token]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  const html = r.file_tree && r.file_tree["index.html"];
  if (!html) return null;
  const { rows: agents } = await pool.query(
    `SELECT a.id, a.name FROM studio_app_agents g
       JOIN book_agents a ON a.id = g.agent_id AND a.tenant_id = g.tenant_id
      WHERE g.project_id=$1 AND a.enabled=true ORDER BY a.name`,
    [r.project_id]
  );
  return { name: r.name, html, agents };
}

// ── Agent-bridge grants (P6) ─────────────────────────────────────────────────
async function listAppAgents(tenantId, projectId) {
  await getProject(tenantId, projectId); // tenant/ownership check
  const granted = (await pool.query(
    `SELECT a.id, a.name FROM studio_app_agents g
       JOIN book_agents a ON a.id = g.agent_id AND a.tenant_id = g.tenant_id
      WHERE g.project_id=$1 AND g.tenant_id=$2 ORDER BY a.name`,
    [projectId, tenantId]
  )).rows;
  const available = (await pool.query(
    `SELECT id, name FROM book_agents WHERE tenant_id=$1 AND enabled=true ORDER BY name`,
    [tenantId]
  )).rows;
  return { granted, available };
}

async function grantAgent(tenantId, projectId, agentId) {
  await getProject(tenantId, projectId);
  const { rows } = await pool.query("SELECT id FROM book_agents WHERE tenant_id=$1 AND id=$2", [tenantId, agentId]);
  if (!rows[0]) throw new StudioError("NOT_FOUND", "Agent not found in this workspace", 404);
  await pool.query(
    "INSERT INTO studio_app_agents(project_id, tenant_id, agent_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [projectId, tenantId, agentId]
  );
  return listAppAgents(tenantId, projectId);
}

async function revokeAgent(tenantId, projectId, agentId) {
  await getProject(tenantId, projectId);
  await pool.query("DELETE FROM studio_app_agents WHERE project_id=$1 AND tenant_id=$2 AND agent_id=$3", [projectId, tenantId, agentId]);
  return listAppAgents(tenantId, projectId);
}

// Public bridge resolver: returns { tenantId } iff the app token is live AND that
// agent is granted to its project — else null. The token is the capability.
async function resolveBridgeGrant(token, agentId) {
  if (!token || !agentId) return null;
  const { rows } = await pool.query(
    `SELECT g.tenant_id
       FROM studio_deployments d
       JOIN studio_app_agents g ON g.project_id = d.project_id AND g.agent_id = $2
      WHERE d.token=$1 AND d.status='live' LIMIT 1`,
    [token, agentId]
  );
  return rows[0] ? { tenantId: rows[0].tenant_id, agentId } : null;
}

async function listDeployments(tenantId, projectId) {
  const { rows } = await pool.query(
    `SELECT id, project_id, version_id, url, status, created_at
       FROM studio_deployments
      WHERE tenant_id=$1 AND project_id=$2
      ORDER BY created_at DESC
      LIMIT 50`,
    [tenantId, projectId]
  );
  return rows;
}

module.exports = {
  StudioError,
  createProject, listProjects, getProject, updateProject,
  createVersion, listVersions, getVersion, listDeployments,
  restoreVersion, publish, getPublished,
  listAppAgents, grantAgent, revokeAgent, resolveBridgeGrant,
};
