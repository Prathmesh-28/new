import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "headroom.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT    NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT   NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedAdminUser(db);
}

function seedAdminUser(db: Database.Database) {
  const existing = db
    .prepare("SELECT id FROM admin_users WHERE username = ?")
    .get("admin");

  if (!existing) {
    const hash = bcrypt.hashSync("headroom@2024", 12);
    db.prepare(
      "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)"
    ).run("admin", hash);
  }
}
