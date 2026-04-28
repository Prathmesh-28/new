import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";

const DJANGO_API = process.env.DJANGO_API_URL ?? "http://localhost:8000";
const SERVICE_KEY = process.env.DJANGO_SERVICE_KEY ?? "";

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] },
): Promise<NextResponse> {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const pathStr = params.path.join("/");
  const djangoUrl = new URL(pathStr, DJANGO_API.endsWith("/") ? DJANGO_API : DJANGO_API + "/");
  djangoUrl.search = request.nextUrl.search;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Service-Key": SERVICE_KEY,
    "X-User-Id": user.id,
    "X-Tenant-Id": user.tenant_id,
  };

  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(request.method);
  const body = isBodyMethod ? await request.text() : undefined;

  const upstream = await fetch(djangoUrl.toString(), {
    method: request.method,
    headers,
    body,
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": contentType },
  });
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params);
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params);
}

export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params);
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params);
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params);
}
