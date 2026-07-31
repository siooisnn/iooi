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

const READONLY_LAYERS = new Set(["mangzhong", "sea", "sunny", "sunny_file"]);

function normalizeLayer(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function readonlyLayerResponse(layer: string) {
  const label = layer === "mangzhong" ? "芒种" : "sea";
  return Response.json({ ok: false, error: `${label} 是只读层，不能写入或修改` }, { status: 403 });
}

function requestLayer(body: Record<string, unknown>) {
  const patch = (body.patch && typeof body.patch === "object") ? body.patch as Record<string, unknown> : {};
  return normalizeLayer(body.layer || patch.layer);
}

function rejectReadonlyLayer(body: Record<string, unknown>) {
  const layer = requestLayer(body);
  return READONLY_LAYERS.has(layer) ? readonlyLayerResponse(layer) : null;
}

const EDIT_FIELDS = [
  "content",
  "title",
  "source",
  "weight",
  "tags",
  "due",
  "status",
  "state",
  "ttl_hours",
  "expires_at",
] as const;

function currentEditBody(operation: "add" | "update" | "delete", body: Record<string, unknown>) {
  const patch = (body.patch && typeof body.patch === "object") ? body.patch as Record<string, unknown> : {};
  const result: Record<string, unknown> = {
    action: operation,
    layer: body.layer ?? patch.layer,
  };
  const itemId = body.item_id ?? body.id ?? patch.item_id ?? patch.id;
  if (itemId !== undefined) result.item_id = itemId;
  for (const field of EDIT_FIELDS) {
    const value = body[field] !== undefined ? body[field] : patch[field];
    if (value !== undefined) result[field] = value;
  }
  return result;
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
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "remember");
  if (action === "sea_file") return postSummerJson("/api/sea_file", body);
  if (action === "sunny_file") return readonlyLayerResponse("sea");
  if (action === "daily_review") return postSummerJson("/api/daily_review", body);
  if (action === "discard_proposal") return Response.json({ ok: true, data: { discarded: true } });

  const blocked = rejectReadonlyLayer(body);
  if (blocked) return blocked;

  if (action === "layer") return postSummerJson("/api/edit", currentEditBody("update", body));
  if (action === "item") {
    const operation = body.actionType === "delete" ? "delete" : "update";
    return postSummerJson("/api/edit", currentEditBody(operation, body));
  }
  if (action === "rain") {
    const operation = body.actionType === "delete" ? "delete" : (body.id || body.item_id ? "update" : "add");
    return postSummerJson("/api/edit", currentEditBody(operation, { ...body, layer: "rain" }));
  }
  if (action === "commit_proposal" || action === "proposal") {
    return postSummerJson("/api/edit", currentEditBody("add", body));
  }
  return postSummerJson("/api/edit", currentEditBody("add", body));
}
