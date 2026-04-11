import { cookies } from "next/headers";
import { getDb } from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const SESSION_COOKIE = "hr_admin_session";
const SESSION_TTL_HOURS = 8;

export interface AdminUser {
  id: number;
  username: string;
}

/** Verify username + password against the DB. Returns the user row or null. */
export function verifyCredentials(
  username: string,
  password: string
): AdminUser | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, password_hash FROM admin_users WHERE username = ?"
    )
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  if (!row) return null;
  const valid = bcrypt.compareSync(password, row.password_hash);
  if (!valid) return null;
  return { id: row.id, username: row.username };
}

/** Create a new session token in the DB and return it. */
export function createSession(userId: number): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    "INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expiresAt);

  return token;
}

/** Delete a session token from the DB. */
export function destroySession(token: string): void {
  const db = getDb();
  db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
}

/** Validate the session cookie against the DB. Returns the user or null. */
export async function getAdminSession(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare(`
      SELECT u.id, u.username
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > datetime('now')
    `)
    .get(token) as AdminUser | undefined;

  return row ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  };
}
