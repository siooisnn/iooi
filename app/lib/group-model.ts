import { WRITING_TOOLS } from "./group-writing-tools";
import type { GroupSpeaker } from "./group-options";
export type ApiGroupMessage = { role: string; content: unknown; tool_calls?: GroupToolCall[]; tool_call_id?: string; reasoning_content?: string };
type GroupToolCall = { id: string; type: string; function: { name: string; arguments: string } };

export async function groupApiReply({ speaker, model, messages, writing, webSearch, effort, tool, signal }: {
  speaker: Exclude<GroupSpeaker, "claude">; model: string; messages: ApiGroupMessage[]; writing: boolean;
  webSearch?: boolean; effort?: string; signal: AbortSignal;
  tool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const deepseek = speaker === "deepseek";
  const key = deepseek ? process.env.GROUP_DEEPSEEK_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error(`${deepseek ? "DeepSeek" : "GPT"} 的服务端密钥尚未配置`);
  const history = [...messages];
  for (let turn = 0; turn < 16; turn++) {
    const response = await fetch(deepseek ? "https://api.deepseek.com/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(!deepseek ? { "HTTP-Referer": "https://sioois.cc", "X-Title": "iooi group" } : {}) },
      body: JSON.stringify({ model, messages: history, max_tokens: writing ? 8192 : 2048, stream: false,
        ...(deepseek ? { thinking: { type: "disabled" } } : { reasoning_effort: ["low", "medium", "high", "xhigh", "max"].includes(effort || "") ? effort : "medium" }),
        ...(writing ? { tools: WRITING_TOOLS.map(({ name, description, inputSchema }) => ({ type: "function", function: { name, description, parameters: inputSchema } })), parallel_tool_calls: false } : {}),
        ...(!deepseek && webSearch ? { plugins: [{ id: "web" }] } : {}),
      }), signal,
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(`${deepseek ? "DeepSeek" : "GPT"} 接口未完成请求（${response.status}），没有切换到其他模型`);
    const answer = data.choices?.[0]?.message as ApiGroupMessage | undefined;
    if (!answer) throw new Error("模型没有返回有效回复");
    if (!answer.tool_calls?.length) {
      if (data.choices?.[0]?.finish_reason === "length") throw new Error("本轮输出达到上限，已执行的文档操作仍保留，请查询后继续");
      const reply = typeof answer.content === "string" ? answer.content.trim() : "";
      if (!reply) throw new Error("模型没有返回文字回复");
      return { reply, model: String(data.model || model) };
    }
    if (!writing) throw new Error("普通群聊没有写写工具权限");
    if (answer.tool_calls.length > 12) throw new Error("本轮工具调用过多");
    history.push(answer);
    for (const call of answer.tool_calls) {
      let result: unknown;
      try {
        if (!WRITING_TOOLS.some((item) => item.name === call.function.name)) throw new Error("未开放的工具");
        result = await tool(call.function.name, JSON.parse(call.function.arguments));
      } catch (error) { result = { ok: false, error: error instanceof Error ? error.message : "操作失败" }; }
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("本轮写写工具步数已用完，已保存的文件保留，请先查看再继续");
}
