"use strict";
// Field-level encryption for PII at rest (PAN, bank account, etc.). AES-256-GCM with a
// VERSIONED, SELF-IDENTIFYING prefix ("enc:v1:") so:
//   • encrypted and not-yet-migrated PLAINTEXT can coexist in the same column during a
//     rollout — decrypt() passes plaintext through untouched;
//   • the backfill is IDEMPOTENT — encrypt() leaves an already-encrypted value alone;
//   • a read never throws — on any failure it returns the raw stored value.
// Key: scrypt(PII_KEY_SECRET || JWT_SECRET). Set a dedicated PII_KEY_SECRET in prod so
// rotating the JWT signing secret doesn't make PII unreadable. (If the key is lost,
// encrypted PII is unrecoverable — that's the point.)
const crypto = require("crypto");

const TAG = "enc:v1:";
let _key;
function key() {
  if (!_key) _key = crypto.scryptSync(process.env.PII_KEY_SECRET || process.env.JWT_SECRET || "dev-secret", "headroom-pii", 32);
  return _key;
}

const isEncrypted = (v) => typeof v === "string" && v.startsWith(TAG);

function encrypt(plain) {
  if (plain == null || plain === "") return plain;       // leave NULL / "" untouched
  const s = String(plain);
  if (s.startsWith(TAG)) return s;                       // already encrypted → idempotent
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return TAG + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

function decrypt(blob) {
  if (blob == null) return blob;
  const s = String(blob);
  if (!s.startsWith(TAG)) return blob;                   // plaintext passthrough (un-migrated row)
  try {
    const b = Buffer.from(s.slice(TAG.length), "base64");
    const iv = b.subarray(0, 12), tag = b.subarray(12, 28), enc = b.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return blob; }                               // never throw on read
}

// Encrypt/decrypt a set of named fields on a row object in place (returns a new object).
const encryptFields = (row, fields) => { if (!row) return row; const out = { ...row }; for (const f of fields) if (f in out) out[f] = encrypt(out[f]); return out; };
const decryptFields = (row, fields) => { if (!row) return row; const out = { ...row }; for (const f of fields) if (f in out) out[f] = decrypt(out[f]); return out; };
// Mask for display where the full value isn't needed (e.g. "••••3456").
const mask = (v, keep = 4) => { const s = v == null ? "" : String(v); if (s.startsWith(TAG)) return "••••"; return s.length <= keep ? s : "••••" + s.slice(-keep); };

// Tables whose PII columns are encrypted at rest. ONLY list a table here once its READ
// paths decrypt (else a backfill would leave consumers showing ciphertext). employees
// (payroll) is wired in routes/payroll.js. Add vendor_master / tenant_profile after
// wiring their reads. Used by the admin backfill — table/field names are from THIS
// fixed registry, never request input.
const PII_TARGETS = [
  { table: "employees", fields: ["pan", "bank_account"] },
];

// One-off, IDEMPOTENT backfill: encrypt rows still holding plaintext (tag-detected, so
// re-running is safe and already-encrypted rows are skipped). Trusted callers only.
async function backfillTable(pool, table, fields) {
  if (!/^[a-z_]+$/.test(table) || !fields.every((f) => /^[a-z_]+$/.test(f))) throw new Error("invalid table/field");
  const cond = fields.map((f) => `(${f} IS NOT NULL AND ${f} NOT LIKE '${TAG}%')`).join(" OR ");
  const { rows } = await pool.query(`SELECT id, ${fields.join(", ")} FROM ${table} WHERE ${cond}`);
  let updated = 0;
  for (const r of rows) {
    const sets = [], vals = [];
    for (const f of fields) if (r[f] != null && !isEncrypted(r[f])) { vals.push(encrypt(r[f])); sets.push(`${f}=$${vals.length}`); }
    if (!sets.length) continue;
    vals.push(r.id);
    await pool.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id=$${vals.length}`, vals);
    updated += 1;
  }
  return { table, scanned: rows.length, encrypted: updated };
}
async function backfillAll(pool) {
  const results = [];
  for (const t of PII_TARGETS) results.push(await backfillTable(pool, t.table, t.fields));
  return results;
}

module.exports = { encrypt, decrypt, isEncrypted, encryptFields, decryptFields, mask, TAG, PII_TARGETS, backfillTable, backfillAll };
