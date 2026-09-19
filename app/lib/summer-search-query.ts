const SUMMER_SCOPE = "(?:summer|记忆|日记|小暑|夏至|芒种|小满|立夏|碎片)";

/**
 * Extract the subject of an explicit Summer lookup command without sending
 * the surrounding conversational sentence to the search backend.
 */
export function extractSummerSearchTarget(value: string): string {
  const text = value.trim();
  if (!text) return "";

  // An explanatory sentence can mention searching more than once (for
  // example, "让他检索 Summer，我说你搜一下小明"). The final explicit
  // search command is the one whose subject should reach Summer.
  const command = /搜索一下|搜一下|搜一搜|搜索|搜下|搜|查找一下|查一下|查找|查下|检索一下|检索|翻一下|翻翻/gi;
  let commandEnd = -1;
  for (const matched of text.matchAll(command)) {
    commandEnd = (matched.index || 0) + matched[0].length;
  }
  let target = (commandEnd >= 0 ? text.slice(commandEnd) : text).trim();

  target = target
    .replace(new RegExp(`^(?:在|去)?\\s*${SUMMER_SCOPE}\\s*(?:里(?:面)?|中)?\\s*(?:的)?[：:,，\\s]*`, "i"), "")
    .replace(/^(?:关于|有关|有没有|是否有|是不是有)\s*/i, "");

  const quoted = target.match(/[“"']([^“”"']{1,80})[”"']/);
  if (quoted?.[1]) target = quoted[1].trim();

  const followupAt = target.search(/[，,；;]\s*(?:看|看看|确认|告诉|有没有|是否|是不是|记不记得)/);
  if (followupAt > 0) target = target.slice(0, followupAt);

  return target
    .replace(/\s*(?:这个词|这个关键词|这几个字|这一段)(?:相关的?)?\s*$/i, "")
    .replace(/\s*(?:的)?(?:相关(?:的)?)?(?:内容|记忆|日记|记录)\s*$/i, "")
    .replace(/[？?！!。~～]+$/g, "")
    .trim();
}
