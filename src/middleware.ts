import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Edge middleware: fast gate — just checks the cookie is present.
 * The real DB session validation happens in the server component (admin/page.tsx)
 * and API routes, which run in the Node.js runtime where better-sqlite3 is available.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and login API through unconditionally
  if (
    pathname === "/admin/login" ||
    pathname.startsWith("/api/admin/login")
  ) {
    return NextResponse.next();
  }

  // All other /admin routes require the session cookie to be present
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
