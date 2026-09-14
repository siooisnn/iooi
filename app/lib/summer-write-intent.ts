export function isExplicitSummerWriteRequest(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  const wantsWrite = /写进|写入|写到|记下|记住|存进|存到|加进|加到|放进|放到|收进|录入/.test(text);
  if (!wantsWrite) return false;
  const textWithoutReminder = text.replace(/(?:不要|别)忘(?:记|了)?/g, "");
  const rejectsWrite = /(?:不用|不要|别|无需|不必|禁止|先别|暂时别).{0,10}(?:写进|写入|写到|记下|记住|存进|存到|加进|加到|放进|放到|收进|录入)/.test(textWithoutReminder);
  if (rejectsWrite) return false;
  const asksWhetherWritten = /(?:有没有|是否|是不是).{0,12}(?:写进|写入|记下|记住)|(?:写进|写入|记下|记住).{0,8}(?:了吗|了没|没有|吗|么)/.test(text);
  if (asksWhetherWritten) return false;
  const wantsSearch = /找|查|搜|翻|看.*日记|读.*日记|记不记得|还记得|想起来|之前|以前|那天|哪天|碎片\s*\d{1,3}|\d{1,2}[.-]\d{1,2}|\d{1,2}月\d{1,2}日?|20\d{2}-\d{1,2}-\d{1,2}/i.test(text);
  return !wantsSearch;
}
