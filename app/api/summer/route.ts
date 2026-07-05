function summerBaseUrl() {
  return (process.env.SUMMER_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function summerHeaders() {
  const token = process.env.SUMMER_TOKEN || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readSummerJson(path: string) {
  const res = await fetch(`${summerBaseUrl()}${path}`, {
    headers: summerHeaders(),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return Response.json(
      { ok: false, error: (data as { error?: string })?.error || `summer returned ${res.status}` },
      { status: res.status }
    );
  }
  return Response.json({ ok: true, data });
}

async function postSummerJson(path: string, body: unknown) {
  const res = await fetch(`${summerBaseUrl()}${path}`, {
    method: "POST",
    headers: summerHeaders(),
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok || (data as { ok?: boolean })?.ok === false) {
    return Response.json(
      { ok: false, error: (data as { error?: string })?.error || `summer returned ${res.status}` },
      { status: res.ok ? 400 : res.status }
    );
  }
  return Response.json({ ok: true, data });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q && q.trim()) {
    return readSummerJson(`/api/search?q=${encodeURIComponent(q.trim())}`);
  }
  return readSummerJson("/api/state");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "remember");
  if (action === "layer") return postSummerJson("/api/layer", body);
  if (action === "item") return postSummerJson("/api/item", body);
  if (action === "sunny_file") return postSummerJson("/api/sunny_file", body);
  if (action === "rain") return postSummerJson("/api/rain", body);
  if (action === "daily_review") return postSummerJson("/api/daily_review", body);
  return postSummerJson("/api/remember", body);
}
