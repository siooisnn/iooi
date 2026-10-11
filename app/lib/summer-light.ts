// A light read of summer for the background beats: 立夏 (who we are) and,
// when asked for, the newest few 小暑 entries. Not the whole wake: the chat
// reads that; a heartbeat only needs to know us and these last few days.
// Read-only; if summer is slow or down this returns "" and the beat goes on.

type ReadResult = {
  results?: Array<{
    layer?: string;
    content?: string;
    items?: Array<{ date?: string; title?: string; content?: string }>;
  }>;
};

const XIAOSHU_ENTRY_CHARS = 1500;

export function renderSummerLight(data: ReadResult, xiaoshu: number): string {
  const results = data.results || [];
  const lixia = String(results.find((entry) => entry.layer === "lixia")?.content || "").trim();
  const days = xiaoshu > 0 ? (results.find((entry) => entry.layer === "xiaoshu")?.items || []).slice(0, xiaoshu) : [];
  const parts: string[] = [];
  if (lixia) parts.push(`## 立夏：我们是谁\n${lixia}`);
  if (days.length) {
    parts.push([
      `## 小暑：最近 ${days.length} 篇`,
      ...days.map((item) => {
        const content = String(item.content || "").trim();
        return `### ${item.date || ""}｜${String(item.title || "小暑").trim()}\n${content.length > XIAOSHU_ENTRY_CHARS ? `${content.slice(0, XIAOSHU_ENTRY_CHARS)}……` : content}`;
      }),
    ].join("\n"));
  }
  return parts.join("\n\n");
}

export async function readSummerLight({ xiaoshu = 0 }: { xiaoshu?: number } = {}): Promise<string> {
  const base = (process.env.SUMMER_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.SUMMER_TOKEN || "";
  const count = Math.max(0, Math.min(10, Math.floor(xiaoshu)));
  const query = new URLSearchParams({ layers: count ? "lixia,xiaoshu" : "lixia", limit: String(Math.max(1, count)) });
  try {
    const res = await fetch(`${base}/api/read?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    return renderSummerLight(await res.json() as ReadResult, count);
  } catch {
    return "";
  }
}
