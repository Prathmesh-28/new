// Agent knowledge base + retrieval (RAG). Each agent can hold uploaded/pasted
// documents; we chunk the content (~800 chars on word boundaries), embed every
// chunk via llm.embed and store one row per chunk in book_agent_docs with its
// vector (JSONB). At run time retrieve() embeds the user's query and ranks the
// agent's chunks by cosine similarity in JS, returning the top-k text joined.
//
// CONTRACT (see orchestrator/http routes): addDoc, listDocs, deleteDoc, retrieve.
// Hard rule for retrieve(): it MUST degrade gracefully - if the agent has no
// docs, or embeddings are unavailable (no key / provider down), it returns an
// empty string and NEVER throws, so a run is never broken by missing knowledge.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const CHUNK = 800;

// Split text into ~CHUNK-char chunks, preferring to break on whitespace so we
// don't slice words. Always returns at least one chunk for non-empty input.
function chunkContent(content) {
  const text = String(content == null ? "" : content).trim();
  if (!text) return [];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + CHUNK, text.length);
    if (end < text.length) {
      const ws = text.lastIndexOf(" ", end);
      if (ws > i + Math.floor(CHUNK / 2)) end = ws; // only break back if it's not too short
    }
    const piece = text.slice(i, end).trim();
    if (piece) chunks.push(piece);
    i = end;
  }
  return chunks;
}

// Cosine similarity over two equal-length numeric vectors. Returns 0 on any
// degenerate input (length mismatch, zero norm) so ranking stays well-defined.
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0, y = Number(b[i]) || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Add a document: chunk → embed → store one row per chunk. Embedding failure is
// surfaced (callers - the upload route - should know the doc was NOT saved), but
// we never leave a half-saved doc behind.
async function addDoc(tenantId, agentId, { title, content } = {}) {
  const t = String(title == null ? "" : title).trim();
  const chunks = chunkContent(content);
  if (!t) throw new PostError("BAD_INPUT", "title required", 400);
  if (!chunks.length) throw new PostError("BAD_INPUT", "content required", 400);

  const llm = require("./llm");
  const vectors = await llm.embed(tenantId, chunks); // throws typed error on failure

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Replace any prior doc with the same title for this agent (idempotent re-upload).
    await client.query(
      "DELETE FROM book_agent_docs WHERE tenant_id=$1 AND agent_id=$2 AND title=$3",
      [tenantId, agentId, t]
    );
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO book_agent_docs(tenant_id,agent_id,title,chunk_index,content,embedding)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [tenantId, agentId, t, i, chunks[i], JSON.stringify(vectors[i] || [])]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { title: t, chunks: chunks.length };
}

// List the agent's docs grouped by title (no vectors) - title, chunk count,
// character length, most-recent timestamp.
async function listDocs(tenantId, agentId) {
  const { rows } = await pool.query(
    `SELECT title,
            COUNT(*)::int           AS chunks,
            SUM(length(content))::int AS chars,
            MAX(created_at)         AS created_at
       FROM book_agent_docs
      WHERE tenant_id=$1 AND agent_id=$2
      GROUP BY title
      ORDER BY MAX(created_at) DESC, title`,
    [tenantId, agentId]
  );
  return rows;
}

async function deleteDoc(tenantId, agentId, title) {
  const { rowCount } = await pool.query(
    "DELETE FROM book_agent_docs WHERE tenant_id=$1 AND agent_id=$2 AND title=$3",
    [tenantId, agentId, String(title == null ? "" : title)]
  );
  return { deleted: rowCount > 0, title };
}

// Retrieve top-k chunks for a query as a single concatenated string. MUST NOT
// throw: any failure (no docs, embeddings unavailable, DB hiccup) degrades to "".
async function retrieve(tenantId, agentId, query, k = 5) {
  try {
    const q = String(query == null ? "" : query).trim();
    if (!q) return "";
    const { rows } = await pool.query(
      "SELECT title, content, embedding FROM book_agent_docs WHERE tenant_id=$1 AND agent_id=$2",
      [tenantId, agentId]
    );
    if (!rows.length) return "";

    const llm = require("./llm");
    let qv;
    try {
      const vecs = await llm.embed(tenantId, [q]);
      qv = vecs && vecs[0];
    } catch {
      return ""; // embeddings unavailable - degrade silently
    }
    if (!Array.isArray(qv) || !qv.length) return "";

    const scored = rows.map((r) => {
      let v = r.embedding;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
      return { title: r.title, content: r.content, score: cosine(qv, v) };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, k)).filter((s) => s.score > 0);
    if (!top.length) return "";
    return top.map((s) => `# ${s.title}\n${s.content}`).join("\n\n");
  } catch {
    return ""; // never break a run on retrieval
  }
}

module.exports = { addDoc, listDocs, deleteDoc, retrieve, chunkContent, cosine };
