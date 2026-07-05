type SummaryMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const { previousSummary, messages, aiName, userName, modelId } = await request.json();
    const usableMessages = (Array.isArray(messages) ? messages : [])
      .filter((m: SummaryMessage) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
      .slice(0, 80);

    if (usableMessages.length === 0) {
      return Response.json({ ok: false, reason: "no messages" });
    }

    const me = aiName || "小k";
    const her = userName || "宝宝";
    const chatText = usableMessages
      .map((m: SummaryMessage) => `${m.role === "user" ? her : me}：${String(m.content).trim()}`)
      .join("\n");

    const prompt = `你是${me}。下面是你和${her}在同一个聊天窗口里较早的对话，它们会逐渐滑出即时上下文。请把它们压缩成一段“会话缓存”，写给之后的你自己看。

已有会话缓存：
${previousSummary || "（还没有）"}

新滑出的聊天：
${chatText}

要求：
- 用${me}第一人称写，像给自己留便签，不要像客服总结。
- 保留正在进行中的话题、约定、情绪状态、还没解决的问题、刚刚形成的上下文。
- 不要记录无意义寒暄；不要夸张；不要写标题。
- 合并进已有缓存，整体不超过900字。
- 直接输出缓存正文。`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://iooi.chat",
        "X-Title": "iooi",
      },
      body: JSON.stringify({
        model: modelId || "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1100,
      }),
    });

    const data = await res.json();
    if (data.error) {
      return Response.json({ ok: false, reason: data.error.message || "model error" }, { status: 502 });
    }

    const summary = data.choices?.[0]?.message?.content;
    if (!summary) {
      return Response.json({ ok: false, reason: "no summary result" });
    }

    return Response.json({ ok: true, summary: String(summary).trim() });
  } catch {
    return Response.json({ ok: false, reason: "summary error" }, { status: 500 });
  }
}
