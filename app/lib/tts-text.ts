// Turns a chat bubble into what should actually be spoken aloud: no links,
// sources, code, markdown marks, emoji or kaomoji.

export const TTS_MAX_CHARS = 2000;

const HAN = /\p{Script=Han}/u;
const ASCII_WORD = /[A-Za-z0-9]{2,}/;
// Bits that hang off a kaomoji, like the "/" in (^o^)/ or the ✧ after (｡•̀ᴗ-).
const KAOMOJI_TAIL = "[/\\\\ﾉノ✧☆★♪♡~～]*";

function isKaomojiBody(body: string) {
  return !HAN.test(body) && !ASCII_WORD.test(body);
}

export function speakableText(raw: string): string {
  let text = String(raw || "");

  // Code never sounds right read out.
  text = text.replace(/```[\s\S]*?(```|$)/g, " ");
  text = text.replace(/`([^`\n]*)`/g, (_, code: string) =>
    code.length <= 20 && !/[\/\\{}<>=;]/.test(code) ? code : " ");

  // [label](url) keeps the label; bare links go.
  text = text.replace(/\[([^\]\n]+)\]\((?:https?:\/\/|www\.)[^)\s]*\)/g, "$1");
  text = text.replace(/(?:https?:\/\/|www\.)[^\s，。！？、）)\]]+/g, " ");

  // "(来源：…)" style asides.
  text = text.replace(/[（(][^（）()\n]*(?:来源|出处|参考|链接|source|via)[^（）()\n]*[）)]/gi, " ");

  // Kaomoji: a bracket group with no Chinese and no real word inside.
  text = text.replace(
    new RegExp(`${KAOMOJI_TAIL}[（(]([^（）()\\n]{1,16})[）)]${KAOMOJI_TAIL}`, "gu"),
    (whole, body: string) => (isKaomojiBody(body) ? " " : whole),
  );

  text = text.replace(/°C/g, "度");

  // Markdown marks.
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "");

  // Emoji, dingbats, ♡, ~ and friends.
  text = text.replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}‍️⃣~～|]/gu, "");

  // Leftovers: empty brackets, dangling slashes.
  text = text
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/(^|\s)[/\\]+(?=\s|$)/gm, "$1");

  text = text
    .split("\n")
    .map((line) => line
      .replace(/[ \t 　]+/g, " ")
      .replace(/ (?=[，。！？；：、）」』…])/g, "")
      // Sparkle runs like ":.｡." left between spaces.
      .replace(/(^| )[.:･｡°*'`,_-]+(?= |$)/g, "$1")
      .replace(/ {2,}/g, " ")
      .trim())
    .filter(Boolean)
    .join("\n");

  return text.length > TTS_MAX_CHARS ? text.slice(0, TTS_MAX_CHARS) : text;
}

export function hasSpeakableText(raw: string) {
  return /[\p{L}\p{N}]/u.test(speakableText(raw));
}
