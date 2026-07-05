import { readStore, withStore } from "@/app/lib/store";

type MemoryEntry = {
  id: string;
  content: string;
  valence: number;
  arousal: number;
  importance: number;
  resolved: boolean;
  pinned?: boolean;
  created: string;
  lastActive: string;
  activations: number;
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    const snapshot = readStore();
    if (!snapshot) return Response.json({ ok: false, reason: "no store" });

    const settings = (snapshot.settings || {}) as Record<string, string>;
    const entries: MemoryEntry[] = (snapshot.memoryEntries || []) as MemoryEntry[];
    const legacyText: string = (settings.memories || "").trim();
    const migrating = entries.length === 0 && legacyText.length > 0;

    const chatText = messages
      .slice(-30)
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? settings.userName || "她" : settings.aiName || "AI"}：${m.content}`
      )
      .join("\n");

    const existingList = entries
      .map((e) => `${e.id}｜${e.resolved ? "[已了结]" : ""}${e.content}`)
      .join("\n");

    const extractPrompt = `你是一个记忆整理系统。根据最近对话,维护关于"${settings.userName || "她"}"的记忆条目。

已有记忆条目(格式: id｜内容):
${existingList || "（暂无）"}
${migrating ? `\n旧版记忆文本(请拆分成独立条目,放进new里):\n${legacyText}\n` : ""}
最近对话:
${chatText}

请输出严格的JSON(不要markdown代码块,不要任何解释),格式:
{
  "new": [
    {"content": "记忆内容,一句话", "valence": 0.5, "arousal": 0.6, "importance": 7, "resolved": false}
  ],
  "resolvedIds": ["对话表明已了结/已解决的旧条目id"],
  "activatedIds": ["对话中被提到或高度相关的旧条目id"]
}

字段说明:
- valence: -1到1,这条记忆的情绪是苦(-1)还是甜(1),中性为0
- arousal: 0到1,情绪强度,平静琐事0.2,重要心事0.6,强烈情绪0.9
- importance: 1到10,对理解她这个人的重要程度
- resolved: 这件事是否已经了结(如"担心考试"在考完后就该了结)

要求:
- 只提取关于她的事实、心事、计划、情绪、关系,不记闲聊流水账
- 临时玩笑、口癖、一次性的撒娇打闹、普通日常流水不要写入——长期记忆只收"过一个月还值得记得"的东西
- 涉及亲密/私密内容时,只用含蓄克制的措辞概括(如"度过了亲密时光"),不记录直白细节和原话
- 和已有条目重复的不要放进new
- 如果对话表明某个旧条目的事情已经过去/解决了,把id放进resolvedIds
- 没有新内容时new可以是空数组`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://iooi.chat",
        "X-Title": "iooi",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: extractPrompt }],
        max_tokens: 2000,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return Response.json({ ok: false, reason: "no extraction result" });

    let parsed: { new?: Array<Partial<MemoryEntry>>; resolvedIds?: string[]; activatedIds?: string[] };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return Response.json({ ok: false, reason: "bad json" });
    }

    const now = new Date().toISOString();
    const resolvedIds = new Set(parsed.resolvedIds || []);
    const activatedIds = new Set(parsed.activatedIds || []);

    const result = await withStore((store) => {
      const currentEntries: MemoryEntry[] = (store.memoryEntries || []) as MemoryEntry[];
      const currentSettings = (store.settings || {}) as Record<string, string>;

      let updated = currentEntries.map((e) => {
        let next = e;
        if (resolvedIds.has(e.id) && !e.resolved) next = { ...next, resolved: true };
        if (activatedIds.has(e.id)) next = { ...next, activations: (next.activations || 0) + 1, lastActive: now };
        return next;
      });

      const seen = new Set(updated.map((e) => e.content.trim()));
      for (const n of parsed.new || []) {
        const content = (n.content || "").trim();
        if (!content || seen.has(content)) continue;
        seen.add(content);
        updated.push({
          id: genId(),
          content,
          valence: Math.max(-1, Math.min(1, Number(n.valence) || 0)),
          arousal: Math.max(0, Math.min(1, Number(n.arousal) ?? 0.5)),
          importance: Math.max(1, Math.min(10, Number(n.importance) || 5)),
          resolved: Boolean(n.resolved),
          created: now,
          lastActive: now,
          activations: 0,
        });
      }

      if (updated.length > 200) {
        const pinned = updated.filter((m) => m.pinned);
        const rest = updated.filter((m) => !m.pinned);
        const score = (m: MemoryEntry) => {
          const days = Math.max(0, (Date.now() - new Date(m.lastActive || m.created).getTime()) / 86400000);
          const base = (m.importance || 5) * Math.pow((m.activations || 0) + 1, 0.3) * Math.exp(-0.05 * days) * (0.5 + (m.arousal || 0.5) * 0.5);
          return m.resolved ? base * 0.05 : base;
        };
        updated = [...pinned, ...rest.sort((a, b) => score(b) - score(a)).slice(0, 200 - pinned.length)];
      }

      store.memoryEntries = updated;
      if (migrating) store.settings = { ...currentSettings, memories: "" };
      return updated;
    });

    return Response.json({ ok: true, entries: result, migrated: migrating });
  } catch {
    return Response.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
