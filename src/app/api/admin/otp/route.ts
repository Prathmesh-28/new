import { NextResponse } from "next/server";
import { queryDb } from "@/lib/db";

// In-memory OTP store (keyed by email) — fine for single-instance; swap for Redis on multi-node
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/admin/otp — generate and return OTP (EmailJS sends it client-side)
export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();

    // Check user exists
    const result = await queryDb(
      `SELECT id FROM users WHERE email = $1 AND status = 'active' LIMIT 1`,
      [normalised]
    );
    if (!result.rows[0]) {
      // Return success anyway to prevent email enumeration
      return NextResponse.json({ sent: true });
    }

    // Rate-limit: block if previous OTP is < 60s old
    const existing = otpStore.get(normalised);
    if (existing && existing.expiresAt - 240_000 > Date.now()) {
      return NextResponse.json({ error: "Please wait before requesting a new code" }, { status: 429 });
    }

    const code = generateOtp();
    otpStore.set(normalised, { code, expiresAt: Date.now() + 300_000, attempts: 0 }); // 5 min TTL

    return NextResponse.json({ sent: true, otp: code }); // otp returned so client-side EmailJS can embed it
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/admin/otp — verify OTP and create session
export async function PUT(request: Request) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code required" }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();
    const entry = otpStore.get(normalised);

    if (!entry) {
      return NextResponse.json({ error: "No OTP found — request a new one" }, { status: 400 });
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalised);
      return NextResponse.json({ error: "OTP expired" }, { status: 400 });
    }
    if (entry.attempts >= 5) {
      otpStore.delete(normalised);
      return NextResponse.json({ error: "Too many attempts — request a new code" }, { status: 429 });
    }

    entry.attempts++;
    if (entry.code !== code.trim()) {
      return NextResponse.json({ error: `Incorrect code (${5 - entry.attempts} tries left)` }, { status: 400 });
    }

    otpStore.delete(normalised);

    // Fetch user
    const result = await queryDb(
      `SELECT id, email, role, tenant_id FROM users WHERE email = $1 AND status = 'active' LIMIT 1`,
      [normalised]
    );
    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ verified: true, user });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
