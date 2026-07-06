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
  const mode = url.searchParams.get("mode");
  const q = url.searchParams.get("q");
  const ref = url.searchParams.get("ref");
  const limit = url.searchParams.get("limit") || "";
  const limitPart = limit ? `&limit=${encodeURIComponent(limit)}` : "";
  if (ref && ref.trim()) {
    return readSummerJson(`/api/read_by_ref?ref=${encodeURIComponent(ref.trim())}${limitPart}`);
  }
  if (mode === "search_clean" && q && q.trim()) {
    return readSummerJson(`/api/search_clean?q=${encodeURIComponent(q.trim())}${limitPart}`);
  }
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
  if (action === "proposal") return postSummerJson("/api/proposal", body);
  if (action === "commit_proposal") {
    return postSummerJson("/api/proposal", {
      action: "commit",
      proposal_id: body.proposal_id,
      patch: body.patch || {},
    });
  }
  if (action === "discard_proposal") {
    return postSummerJson("/api/proposal", {
      action: "discard",
      proposal_id: body.proposal_id,
    });
  }
  return postSummerJson("/api/remember", body);
}
