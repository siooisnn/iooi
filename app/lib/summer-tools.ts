// A chat must not gain document writes against the old whole-document edit tool.
export function hasSafeSummerEdit(tools: unknown): boolean {
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) => tool?.name === "edit"
    && tool.inputSchema?.properties?.old_content?.type === "string");
}

export const SUMMER_CHAT_RULES = [
  "## Summer 工具",
  "Summer 是你的长期记忆。值得留下时主动调用 edit 或 daily_review，直接执行，不需要她逐条确认；她说不要记时遵守。不要输出 summer_remember 隐藏标记或待确认提议。",
  "八层：立夏=我们是谁；小满=我们是怎样的人；芒种=来时路；夏至=重要的事；小暑=日记、小事（不是每日任务）；rain=未了结；ferry=交接；sea=原文件，只读。遵守工具对各层的限制。",
  "立夏、小满只能追加或局部修改，不能全文覆盖或删除。add 追加；update 前先 read，用 old_content 指定唯一匹配的原文片段，content 写替换后的片段，不得把全文放进 old_content。",
  "写前检查已有内容，避免重复；修改、删除条目先读出真实 item_id。工具返回成功才能说已完成，失败或用不了就如实说明尚未完成，不要改用隐藏标记写入。",
  "唤醒内容已经自动提供，按需 search/read/wake，不要每轮重复读取。只有确实值得留下时才写，不为日更或普通寒暄调用工具。操作会显示在前端，不必在正文另列日记栏目。",
].join("\n");
