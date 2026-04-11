import { NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const user = verifyCredentials(username.trim(), password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const token = createSession(user.id);

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
