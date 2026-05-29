import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const IS_GCP = !API_URL.startsWith("http://localhost");

async function getIdentityToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${API_URL}`,
      { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" },
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: "GET" | "PATCH",
) {
  const { path } = await context.params;
  const search = request.nextUrl.search;
  const url = `${API_URL}/api/${path.join("/")}${search}`;

  const headers: Record<string, string> = {};
  if (IS_GCP) {
    const token = await getIdentityToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let body: string | undefined;
  if (method !== "GET") {
    body = await request.text();
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
  }

  // Le backend renvoie text/csv pour l'export — on relaie tel quel (stream + headers).
  const isExport = path[path.length - 1] === "export";

  try {
    const res = await fetch(url, { method, cache: "no-store", headers, body });

    if (isExport && res.ok) {
      const blob = await res.arrayBuffer();
      const out = new NextResponse(blob, { status: res.status });
      const ct = res.headers.get("content-type"); if (ct) out.headers.set("content-type", ct);
      const cd = res.headers.get("content-disposition"); if (cd) out.headers.set("content-disposition", cd);
      return out;
    }

    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      return NextResponse.json(data, { status: res.status });
    } catch {
      console.error(`API non-JSON [${res.status}] ${url}:`, text.slice(0, 200));
      return NextResponse.json({ error: "Backend error" }, { status: res.status });
    }
  } catch (err) {
    console.error(`API unreachable ${url}:`, err);
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context, "GET");
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context, "PATCH");
}
