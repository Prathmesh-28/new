import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    destroySession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
