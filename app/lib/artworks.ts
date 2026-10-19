export const ARTWORK_LIMITS = { source: 200_000, title: 80, count: 100 };
export type ArtworkDraft = { title: string; html: string };
export type Artwork = ArtworkDraft & { id: string; createdAt: number; removedAt?: number };
export type ArtworkChunk = { kind: "text"; text: string } | { kind: "code"; language: string; text: string; artwork?: ArtworkDraft };

/** Preserve code and its companion files in one bubble, including blank lines inside the source. */
export function splitChatReply(content: string): string[] {
  return (/^```/m.test(content) ? [content] : content.split(/\n{2,}/)).map((part) => part.trim()).filter(Boolean);
}

/** Only completed HTML fences get a preview; incomplete streamed code stays text. */
export function artworkChunks(content: string): ArtworkChunk[] {
  const source = content.replace(/\r\n/g, "\n");
  const fences = [...source.matchAll(/^```([^\n`]*)\n([\s\S]*?)^```[ \t]*(?:\n|$)/gm)];
  const htmlBlocks = fences.filter((m) => /^(html|htm)$/i.test(m[1].trim()));
  // A single HTML file may have separate CSS/JS companions in the same reply.
  const css = htmlBlocks.length === 1 ? fences.filter((m) => /^css$/i.test(m[1].trim())).map((m) => m[2]).join("\n") : "";
  const js = htmlBlocks.length === 1 ? fences.filter((m) => /^(js|javascript)$/i.test(m[1].trim())).map((m) => m[2]).join("\n") : "";
  const chunks: ArtworkChunk[] = [];
  let cursor = 0;
  for (const match of fences) {
    if (match.index! > cursor) chunks.push({ kind: "text", text: source.slice(cursor, match.index) });
    const language = match[1].trim().toLowerCase();
    const code = match[2];
    let artwork: ArtworkDraft | undefined;
    if (/^(html|htm)$/.test(language) && code.trim()) {
      const html = `${code}${css ? `\n<style>\n${css}\n</style>` : ""}${js ? `\n<script>\n${js}\n</script>` : ""}`;
      const title = code.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (html.length <= ARTWORK_LIMITS.source) artwork = { title: (title || "小作品").slice(0, ARTWORK_LIMITS.title), html };
    }
    chunks.push({ kind: "code", language, text: code, ...(artwork ? { artwork } : {}) });
    cursor = match.index! + match[0].length;
  }
  if (cursor < source.length) chunks.push({ kind: "text", text: source.slice(cursor) });
  return chunks;
}

export const ARTWORK_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
/** Put the policy before all user markup. The frame also has an opaque sandbox origin. */
export function artworkDocument(html: string) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${ARTWORK_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>document.addEventListener('click',function(e){if(e.target instanceof Element&&e.target.closest('a[href]'))e.preventDefault()},true);document.addEventListener('submit',function(e){e.preventDefault()},true);</script></head><body>${html}</body></html>`;
}

export const ARTWORK_CHAT_PROMPT = `她可以在普通聊天里直接预览你做的小网页、互动卡片和小游戏，再存到桌面的作品盒。只有她想要这种作品时才生成，不要普通聊天也自动做。需要时用一个完整的 html 代码块（以三个反引号加html开头），把HTML/CSS/JavaScript全放进一个文件，写好<title>作品名</title>，尽量适配手机。预览不联网，不读登录、聊天、存储或其他页面，不依赖外部CDN、图片、框架或API；用内联CSS、普通JavaScript和内联SVG。表单交互用事件处理并阻止页面跳转，反馈直接显示在作品里，不用alert。生成代码不会自动保存，是否存进作品盒由她点按钮决定。`;
