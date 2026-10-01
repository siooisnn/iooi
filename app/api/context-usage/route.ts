import { readContextStore } from "@/app/lib/store";
import { estimateTokens, GROUP_CONTEXT_BUDGET, planContext, WORK_CONTEXT_BUDGET,
  type ContextMessage, type ContextSnapshot } from "@/app/lib/context-budget";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.IOOI_TOKEN && request.headers.get("x-iooi-token") !== process.env.IOOI_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid context" }, { status: 400 }); }
  const kind = body.kind === "group" ? "group" : body.kind === "work" ? "work" : null;
  const sessionId = body.sessionId;
  const project = body.project;
  const messages = body.messages as ContextMessage[];
  if (!kind || typeof sessionId !== "string" || !/^[\w-]{1,200}$/.test(sessionId)
    || (kind === "work" && project !== "iooi" && project !== "summer")
    || !Array.isArray(messages) || messages.length > 2_000
    || messages.some((message, index) => !message || !Number.isInteger(message.index) || message.index < 0
      || (index > 0 && message.index <= messages[index - 1].index)
      || !["user", "assistant"].includes(message.role) || typeof message.content !== "string"
      || message.content.length > 500_000)
    || messages.reduce((length, message) => length + message.content.length, 0) > 2_000_000) {
    return Response.json({ error: "Invalid context" }, { status: 400 });
  }
  const scope = kind === "group" ? `group:${sessionId}` : `work:${project}:${sessionId}`;
  const snapshots = readContextStore()?.snapshots as Record<string, ContextSnapshot> | undefined;
  const budget = kind === "group" ? GROUP_CONTEXT_BUDGET : WORK_CONTEXT_BUDGET;
  const overhead = kind === "group"
    ? 3_000 + estimateTokens(typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 100_000) : "")
    : 3_200;
  try {
    const plan = planContext(messages, snapshots?.[scope], budget, overhead);
    return Response.json({ tokens: plan.tokens, budget, until: plan.current.until });
  } catch {
    return Response.json({ tokens: budget, budget, until: 0 });
  }
}
