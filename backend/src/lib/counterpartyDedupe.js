"use strict";
// Counterparty PAN-dedupe + entity-group detection (roadmap #162). A GSTIN embeds the PAN
// (characters 3-12), so counterparties across invoices and party ledgers can be grouped by PAN
// to reveal: (a) the SAME entity billed under multiple GSTINs (multi-state / multi-branch), and
// (b) name-variant duplicates that should be merged. Pure read over non-RLS tables.
const { pool } = require("../db");

// PAN = GSTIN chars 3-12 (0-indexed 2..11).
const panFromGstin = (g) => (g && String(g).trim().length >= 12 ? String(g).trim().substring(2, 12).toUpperCase() : null);
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

async function entityGroups(tenantId, db = pool) {
  const [inv, led] = await Promise.all([
    db.query("SELECT DISTINCT customer_name AS name, NULLIF(customer_gstin,'') AS gstin FROM invoices WHERE tenant_id=$1 AND customer_name IS NOT NULL", [tenantId]).catch(() => ({ rows: [] })),
    db.query("SELECT name, NULLIF(gstin,'') AS gstin, NULLIF(pan,'') AS pan FROM book_ledgers WHERE tenant_id=$1 AND is_party=true", [tenantId]).catch(() => ({ rows: [] })),
  ]);
  const parties = [];
  for (const r of inv.rows) parties.push({ source: "invoice", name: r.name, gstin: r.gstin || null, pan: panFromGstin(r.gstin) });
  for (const r of led.rows) parties.push({ source: "ledger", name: r.name, gstin: r.gstin || null, pan: (r.pan ? String(r.pan).trim().toUpperCase() : null) || panFromGstin(r.gstin) });

  // Group by PAN.
  const byPan = new Map();
  for (const p of parties) if (p.pan) { if (!byPan.has(p.pan)) byPan.set(p.pan, []); byPan.get(p.pan).push(p); }

  const groups = [];
  for (const [pan, ps] of byPan) {
    const names = [...new Set(ps.map((p) => p.name))];
    const gstins = [...new Set(ps.map((p) => p.gstin).filter(Boolean))];
    const distinctNormNames = new Set(ps.map((p) => norm(p.name)));
    const multiGstin = gstins.length > 1;
    const nameVariants = distinctNormNames.size > 1;
    if (multiGstin || nameVariants) {
      groups.push({ pan, names, gstins, members: ps.length, multi_gstin: multiGstin, name_variants: nameVariants });
    }
  }
  groups.sort((a, b) => b.members - a.members);

  // Name-only potential duplicates among counterparties with NO PAN (can't group by PAN).
  const noPan = parties.filter((p) => !p.pan);
  const nameMap = new Map();
  for (const p of noPan) { const k = norm(p.name); if (!nameMap.has(k)) nameMap.set(k, new Set()); nameMap.get(k).add(p.name); }

  return {
    entity_groups: groups,
    summary: {
      counterparties: parties.length,
      distinct_pans: byPan.size,
      entity_groups: groups.length,
      multi_gstin_entities: groups.filter((g) => g.multi_gstin).length,
      name_variant_dupes: groups.filter((g) => g.name_variants).length,
      without_pan: noPan.length,
    },
  };
}

module.exports = { entityGroups, panFromGstin };
