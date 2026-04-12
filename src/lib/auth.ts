import { cookies } from "next/headers";
import { queryDb, generateSessionToken } from "./db";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE = "hr_admin_session";
const SESSION_TTL_HOURS = 8;

export interface AdminUser {
  id: string;
  email: string;
  role: "owner" | "accountant" | "investor" | "admin";
  tenant_id: string;
}

export interface SessionData {
  token: string;
  user_id: string;
  tenant_id: string;
  expires_at: Date;
  user: AdminUser;
}

/** Verify email + password against the DB. Returns the user row or null. */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<AdminUser | null> {
  try {
    const result = await queryDb(
      `SELECT id, email, role, tenant_id, password_hash 
       FROM users 
       WHERE email = $1 AND status = 'active'`,
      [email]
    );

    const row = result.rows[0];
    if (!row) return null;

    // Verify password hash
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      tenant_id: row.tenant_id,
    };
  } catch (error) {
    console.error("Error verifying credentials:", error);
    return null;
  }
}

/** Create a new session token in the DB and return it. */
export async function createSession(userId: string, tenantId: string): Promise<string> {
  try {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await queryDb(
      `INSERT INTO sessions (token, user_id, tenant_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [token, userId, tenantId, expiresAt]
    );

    return token;
  } catch (error) {
    console.error("Error creating session:", error);
    throw error;
  }
}

/** Delete a session token from the DB. */
export async function destroySession(token: string): Promise<void> {
  try {
    await queryDb("DELETE FROM sessions WHERE token = $1", [token]);
  } catch (error) {
    console.error("Error destroying session:", error);
  }
}

/** Validate the session cookie against the DB. Returns the user or null. */
export async function getAdminSession(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const result = await queryDb(
      `SELECT u.id, u.email, u.role, u.tenant_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1
         AND s.expires_at > NOW()
       LIMIT 1`,
      [token]
    );

    return result.rows[0] ?? null;
  } catch (error) {
    console.error("Error getting admin session:", error);
    return null;
  }
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
