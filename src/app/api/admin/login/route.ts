import { NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, otp_verified, user_id, tenant_id } = body;

    // OTP-verified path — OTP route already authenticated the user
    if (otp_verified && user_id && tenant_id) {
      const token = await createSession(user_id, tenant_id);
      const response = NextResponse.json({ success: true });
      response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return response;
    }

    // Password path (fallback)
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const user = await verifyCredentials(email.trim(), password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createSession(user.id, user.tenant_id);
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
