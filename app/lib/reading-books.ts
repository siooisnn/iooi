export type ReadingCompanion = "claude" | "gpt";
export type ReadingChapter = { id: string; title: string; paragraphs: string[] };
export type ReadingAnnotation = {
  id: string;
  chapterId: string;
  paragraphIndex: number;
  quote: string;
  content: string;
};
export type ReadingBook = {
  id: string;
  title: string;
  companion: ReadingCompanion;
  chapters: ReadingChapter[];
  annotations: ReadingAnnotation[];
  position: { chapterId: string; paragraphIndex: number };
  preRead: { status: "not-started" | "reading" | "completed" | "failed"; completedChapters: number };
  createdAt: number;
  lastReadAt: number;
  isDemo: boolean;
};

export const MAX_READING_BYTES = 10 * 1024 * 1024;
const CHAPTER_HEADING = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回卷节部篇].*|chapter\s+\S+.*|序章|序言|前言|楔子|后记|尾声|引子)$/i;

export function parseReadingText(bytes: Uint8Array): ReadingChapter[] {
  if (bytes.byteLength > MAX_READING_BYTES) throw new Error("这本书太大了，TXT 暂时最多支持 10MB。");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try { text = new TextDecoder("gb18030", { fatal: true }).decode(bytes); }
    catch { throw new Error("没能读出文字，请将文件另存为 UTF-8 格式的 TXT。"); }
  }
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (text.includes("\0")) throw new Error("这个文件不像 TXT 正文，请检查后重新导入。");
  const chapters: ReadingChapter[] = [];
  let title = "正文";
  let paragraphs: string[] = [];
  function finish() {
    if (!paragraphs.length) return;
    // Bound each rendered chapter even when a TXT has no chapter headings.
    for (let offset = 0; offset < paragraphs.length; offset += 240) {
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        title: offset === 0 ? title : `${title} · 续 ${Math.floor(offset / 240)}`,
        paragraphs: paragraphs.slice(offset, offset + 240),
      });
    }
    paragraphs = [];
  }
  for (const line of text.split("\n")) {
    const content = line.trim();
    if (!content) continue;
    if (content.length <= 60 && CHAPTER_HEADING.test(content)) {
      finish();
      title = content;
    } else {
      paragraphs.push(content);
    }
  }
  finish();
  if (!chapters.length) throw new Error("这份文件里还没有可以阅读的正文。");
  return chapters;
}

export function readingProgress(book: ReadingBook): number {
  const total = book.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0);
  const chapterIndex = book.chapters.findIndex((chapter) => chapter.id === book.position.chapterId);
  if (chapterIndex < 0 || !book.lastReadAt) return 0;
  const before = book.chapters.slice(0, chapterIndex).reduce((sum, chapter) => sum + chapter.paragraphs.length, 0);
  const paragraph = Math.max(0, Math.min(book.position.paragraphIndex, book.chapters[chapterIndex].paragraphs.length - 1));
  return total <= 1 ? 100 : Math.round((before + paragraph) / (total - 1) * 100);
}

export function createReadingDemo(companion: ReadingCompanion): ReadingBook {
  const chapters: ReadingChapter[] = [
    { id: "demo-1", title: "第一章 窗边", paragraphs: [
      "傍晚的雨落在窗沿。她把书翻开，纸页在灯下泛着柔和的白。",
      "桌上放着两只杯子，其中一只还冒着热气。没有人催她读快一点。",
      "她停在一句话前，忽然觉得，慢慢读也是一种抵达。",
      "窗外的街灯亮了。她给书折上书签，决定明天继续。",
    ] },
    { id: "demo-2", title: "第二章 明天", paragraphs: [
      "第二天，阳光把昨夜的雨留在了叶尖。",
      "她翻到昨天停下的地方，故事还在那里等她。",
      "有些陪伴很安静，却能让一个普通的下午变得长久。",
    ] },
  ];
  return {
    id: `reading-demo-${companion}`, title: "窗边的两只杯子", companion, chapters,
    annotations: [{ id: "demo-note-1", chapterId: "demo-1", paragraphIndex: 1,
      quote: "没有人催她读快一点。", content: "我喜欢这句。你可以停一会儿，也可以明天再读，我会在这里等你。" },
    { id: "demo-note-2", chapterId: "demo-2", paragraphIndex: 1,
      quote: "故事还在那里等她。", content: "书签留住了页码，我们留住了这个下午。" }],
    position: { chapterId: "demo-1", paragraphIndex: 0 },
    preRead: { status: "completed", completedChapters: 2 },
    createdAt: Date.now(), lastReadAt: 0, isDemo: true,
  };
}
