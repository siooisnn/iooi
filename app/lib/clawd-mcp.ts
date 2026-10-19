import { changeClawd, readClawd } from "./clawd-store";
import { talkToClawd } from "./clawd-chat";
import { CLAWD_ACTIONS, CLAWD_WARDROBE } from "./clawd-shared";
import { guardClawdAutonomy, logClawdCare } from "./clawd-life";

export const CLAWD_TOOLS = [
  { name: "clawd_read", description: "看你和她共同养的小砖：当前状态、四项数值、穿戴、来访记录和最近的对话。尚未迁移时请她先打开小砖页面。", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "clawd_action", description: "照顾同一只小砖：喂饭、摸摸、玩耍、洗澡、哄睡、叫醒，或从现有衣柜换装(wear)。来访署名酥酥；小砖会按真实状态拒绝不合适的操作。先clawd_read；重试复用requestId。wear需slot和id，id=null脱下。", inputSchema: {
    type: "object", additionalProperties: false,
    properties: { action: { type: "string", enum: [...CLAWD_ACTIONS, "wear"] }, slot: { type: "string", enum: Object.keys(CLAWD_WARDROBE) },
      id: { type: ["string", "null"], enum: [...Object.values(CLAWD_WARDROBE).flat(), null] }, requestId: { type: "string", minLength: 8, maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" } },
    required: ["action", "requestId"],
  } },
  { name: "clawd_talk", description: "以酥酥身份和小砖说句话，由小砖自己的DeepSeek模型回应，保存在共用对话中。每次仅在确实想说话时调用，不循环对话。requestId重试复用。", inputSchema: {
    type: "object", additionalProperties: false, properties: { text: { type: "string", minLength: 1, maxLength: 500 }, requestId: { type: "string", minLength: 8, maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" } }, required: ["text", "requestId"],
  } },
];
export async function callClawdTool(name: string, args: Record<string, unknown>, access: string) {
  if (access !== "full" && access !== "read" && access !== "life") throw new Error("这个连接不能访问小砖。");
  if (name === "clawd_talk" && access === "life") throw new Error("自主活动可以照顾小砖；和小砖说话请在聊天或完整连接里进行。");
  if (access === "life") guardClawdAutonomy();
  const result = name === "clawd_read" ? readClawd() : name === "clawd_action"
    ? await changeClawd(args.action, args, "susu", args.requestId, access === "life" ? guardClawdAutonomy : undefined) : name === "clawd_talk" ? await talkToClawd(args.text, "susu", args.requestId) : null;
  if (!result) throw new Error("不认识这个小砖工具。");
  if (name === "clawd_action" && !("refusal" in result && result.refusal)) await logClawdCare(String(args.action), String(args.requestId), access === "life" ? "life" : "elsewhere");
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: false };
}
