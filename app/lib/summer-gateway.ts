type SummerGatewayConfig = {
  baseUrl: () => string;
  token: () => string;
  label: string;
};

const READONLY_LAYERS = new Set(["sea", "sunny", "sunny_file"]);
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

function normalizeLayer(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function readonlyLayerResponse(layer: string) {
  const label = layer.startsWith("sunny") ? "sea" : layer;
  return Response.json({ ok: false, error: `${label} 是只读层，不能写入或修改` }, { status: 403 });
}

function requestLayer(body: Record<string, unknown>) {
  const patch = body.patch && typeof body.patch === "object" ? body.patch as Record<string, unknown> : {};
  return normalizeLayer(body.layer || patch.layer);
}

function rejectReadonlyLayer(body: Record<string, unknown>) {
  const layer = requestLayer(body);
  return READONLY_LAYERS.has(layer) ? readonlyLayerResponse(layer) : null;
}

function currentEditBody(operation: "add" | "update" | "delete", body: Record<string, unknown>) {
  const patch = body.patch && typeof body.patch === "object" ? body.patch as Record<string, unknown> : {};
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

export function createSummerGateway(config: SummerGatewayConfig) {
  function baseUrl() {
    return config.baseUrl().trim().replace(/\/+$/, "");
  }

  function headers() {
    const token = config.token().trim();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function fetchSummer(path: string, init: RequestInit, timeoutMs = 12_000) {
    const base = baseUrl();
    if (!base) throw new Error(`${config.label} 尚未配置`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${config.label} 请求超时`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readJson(path: string) {
    let res: Response;
    try {
      res = await fetchSummer(path, { headers: headers(), cache: "no-store" });
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : `${config.label} request failed` },
        { status: 504 }
      );
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return Response.json(
        { ok: false, error: (data as { error?: string })?.error || `${config.label} returned ${res.status}` },
        { status: res.status }
      );
    }
    return Response.json({ ok: true, data });
  }

  async function postJson(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetchSummer(path, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body || {}),
      });
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : `${config.label} request failed` },
        { status: 504 }
      );
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok || (data as { ok?: boolean })?.ok === false) {
      return Response.json(
        { ok: false, error: (data as { error?: string })?.error || `${config.label} returned ${res.status}` },
        { status: res.ok ? 400 : res.status }
      );
    }
    return Response.json({ ok: true, data });
  }

  async function GET(request: Request) {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const q = url.searchParams.get("q");
    const ref = url.searchParams.get("ref");
    const limit = url.searchParams.get("limit") || "";
    const limitPart = limit ? `&limit=${encodeURIComponent(limit)}` : "";
    if (ref && ref.trim()) return readJson(`/api/read?ref=${encodeURIComponent(ref.trim())}${limitPart}`);
    if (mode === "search_clean" && q?.trim()) return readJson(`/api/search?q=${encodeURIComponent(q.trim())}${limitPart}`);
    if (q?.trim()) return readJson(`/api/search?q=${encodeURIComponent(q.trim())}`);
    return readJson("/api/state");
  }

  async function POST(request: Request) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "remember");
    if (action === "sea_file") return postJson("/api/sea_file", body);
    if (action === "sunny_file") return readonlyLayerResponse("sea");
    if (action === "daily_review") return postJson("/api/daily_review", body);
    if (action === "discard_proposal") return Response.json({ ok: true, data: { discarded: true } });

    const blocked = rejectReadonlyLayer(body);
    if (blocked) return blocked;
    if (action === "layer") return postJson("/api/edit", currentEditBody("update", body));
    if (action === "item") {
      const operation = body.actionType === "delete" ? "delete" : "update";
      return postJson("/api/edit", currentEditBody(operation, body));
    }
    if (action === "rain") {
      const operation = body.actionType === "delete" ? "delete" : (body.id || body.item_id ? "update" : "add");
      return postJson("/api/edit", currentEditBody(operation, { ...body, layer: "rain" }));
    }
    if (action === "commit_proposal" || action === "proposal") {
      return postJson("/api/edit", currentEditBody("add", body));
    }
    return postJson("/api/edit", currentEditBody("add", body));
  }

  return { GET, POST };
}
