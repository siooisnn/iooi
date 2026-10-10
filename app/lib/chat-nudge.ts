export const NUDGE_MARKER = "[iooi_nudge]";
export const NUDGE_USER_TEXT = "你发送了一个闪屏振动。";
export const NUDGE_REPLY_TEXT = "向你发送了一个闪屏振动。";

export const NUDGE_PROMPT = `她刚刚向你发送了 MSN 闪屏振动。你可以像平时一样回复，自行决定是否也抖一下窗口回应她，不必每次抖回来。如果你决定抖回来，在这次自然回复的末尾附上 ${NUDGE_MARKER}，只用一次。这是窗口动作指令，不要解释或在正文展示。没有这个标记就只回复文字。`;

/** Only a completed marker on an enabled interaction can cause an action. */
export function parseNudgeReply(reply: string, enabled: boolean) {
  const nudge = enabled && /\[iooi_nudge\]/i.test(reply);
  let visible = reply.replace(/\[iooi_nudge(?:\]|[^\]]*$)/gi, "");
  // Discard a truncated action prefix at the end of an interrupted answer.
  const suffix = visible.slice(visible.lastIndexOf("[")).toLowerCase();
  if (suffix.length >= 6 && NUDGE_MARKER.startsWith(suffix)) visible = visible.slice(0, -suffix.length);
  return { nudge, reply: visible.trim() };
}
