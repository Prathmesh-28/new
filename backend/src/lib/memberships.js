"use strict";
// Keep tenant_memberships (the #197 source of truth for "who is in a firm, and as what
// role") consistent with every user-management mutation. Seat counting and team
// enumeration read from this table, so any place that adds/moves/re-roles a user in a
// tenant must call through here. Accepts an optional pg client so callers can run inside
// their own transaction (e.g. the super-admin-guard txn in users.js).
const { pool } = require("../db");

async function addMembership(userId, tenantId, role, db = pool) {
  await db.query(
    "INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') " +
      "ON CONFLICT (user_id, tenant_id) DO UPDATE SET role=EXCLUDED.role, status='active'",
    [userId, tenantId, role]
  );
}

async function setMembershipRole(userId, tenantId, role, db = pool) {
  await db.query("UPDATE tenant_memberships SET role=$3 WHERE user_id=$1 AND tenant_id=$2", [userId, tenantId, role]);
}

async function removeMembership(userId, tenantId, db = pool) {
  await db.query("DELETE FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2", [userId, tenantId]);
}

module.exports = { addMembership, setMembershipRole, removeMembership };
