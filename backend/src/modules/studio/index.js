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
  const slug = await uniqueSlug(tenantId, projName);
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
    throw e;
  } finally {
    client.release();
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
};
