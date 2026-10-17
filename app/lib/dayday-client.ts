"use client";

import { apiFetch } from "./client-api";
import { canonical, type DaydaySnapshot } from "./dayday";

export async function getDayday(): Promise<DaydaySnapshot> {
  const response = await apiFetch("/api/dayday", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "无法打开 dayday。");
  return data.state;
}
const pending = new Map<string, string>();
const KEY = "iooi:dayday:pending:v1";
/** Retain ambiguous request IDs across reloads; retrying cannot create a second payment. */
export async function postDayday(action: string, input: Record<string, unknown> = {}) {
  const payload = { action, ...input };
  const key = canonical(payload);
  let requests: Record<string, string> = {};
  try { requests = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const requestId = pending.get(key) || requests[key] || crypto.randomUUID();
  pending.set(key, requestId);
  requests[key] = requestId;
  try { localStorage.setItem(KEY, JSON.stringify(requests)); } catch {}
  let response: Response;
  try { response = await apiFetch("/api/dayday", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId }) }); }
  catch { throw new Error("网络中断，结果尚未确认。请先查看订单；重试相同操作会沿用原请求编号。"); }
  const data = await response.json();
  if (response.status < 500) {
    pending.delete(key);
    try { const latest = JSON.parse(localStorage.getItem(KEY) || "{}"); delete latest[key]; localStorage.setItem(KEY, JSON.stringify(latest)); } catch {}
  }
  if (!response.ok || !data.ok) throw new Error(data.error || "dayday 保存失败。");
  window.dispatchEvent(new Event("dayday:changed"));
  return data.state as DaydaySnapshot;
}
