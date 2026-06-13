#!/usr/bin/env node
// Promote a user to super_admin (or create one). Run against the live DB:
//   node src/scripts/make-admin.js you@example.com [password]
// - If the user exists, their role becomes super_admin (password unchanged).
// - If not, a new super_admin is created with the given password (default printed).
require("dotenv").config();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");

(async () => {
  const email = (process.argv[2] || "").toLowerCase();
  if (!email) {
    console.error("Usage: node src/scripts/make-admin.js <email> [password]");
    process.exit(1);
  }
  const { rows } = await pool.query("SELECT id, role FROM users WHERE email=$1", [email]);
  if (rows[0]) {
    if (rows[0].role === "super_admin") {
      console.log(`✓ ${email} is already a super_admin.`);
    } else {
      await pool.query("UPDATE users SET role='super_admin' WHERE id=$1", [rows[0].id]);
      console.log(`✓ Promoted ${email} to super_admin.`);
    }
  } else {
    const pass = process.argv[3] || crypto.randomBytes(6).toString("hex");
    const hash = await bcrypt.hash(pass, 10);
    await pool.query(
      "INSERT INTO users(email,password,role,tenant_id,first_login) VALUES($1,$2,'super_admin','admin',false)",
      [email, hash]
    );
    console.log(`✓ Created super_admin ${email}`);
    console.log(`  Password: ${pass}`);
  }
  await pool.end();
  process.exit(0);
})().catch(err => { console.error(err.message); process.exit(1); });
