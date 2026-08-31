type SummaryMessage = {
  role: "user" | "assistant";
  content: string;
  speaker?: "claude" | "gpt";
};

export async function POST(request: Request) {
  try {
    const { mode, previousSummary, messages, aiName, gptName, userName, modelId, reasoningEffort } = await request.json();
    const usableMessages = (Array.isArray(messages) ? messages : [])
      .filter((m: SummaryMessage) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
      .slice(0, 80);

    if (usableMessages.length === 0) {
      return Response.json({ ok: false, reason: "no messages" });
    }

    const me = aiName || "王酥酥";
    const her = userName || "宝宝";
    const gpt = gptName || "GPT";
    const isGroup = mode === "group";
    const chatText = usableMessages.map((m: SummaryMessage) => {
      const owner = m.role === "user" ? her : m.speaker === "gpt" ? gpt : me;
      return `${owner}：${String(m.content).trim()}`;
    }).join("\n");

    const prompt = isGroup ? `下面是${her}、${me}和${gpt}在同一间群聊里较早的公开消息，它们会逐渐滑出即时上下文。请把它们压缩成一份三个人共用的“群聊前情摘要”。

已有群聊摘要：
${previousSummary || "（还没有）"}

新滑出的群消息：
${chatText}

要求：
- 使用中立第三人称，始终标清是谁说的；不要把一人的话记到另一人名下。
- 保留正在进行的话题、共识、分歧、约定、情绪和未解决的问题。
- 只能总结上面公开出现的群消息，不得补充任何人的私聊、Summer、内部思考或隐藏信息。
- 不记录无意义寒暄，不写标题；合并已有摘要，整体不超过1200字。
- 直接输出摘要正文。` : `你是${me}。下面是你和${her}在同一个聊天窗口里较早的对话，它们会逐渐滑出即时上下文。请把它们压缩成一段“会话缓存”，写给之后的你自己看。

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
        max_tokens: isGroup ? 1500 : 1100,
        ...(String(modelId || "").includes("gpt-5.6") && ["none", "low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)
          ? { reasoning_effort: reasoningEffort }
          : {}),
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
