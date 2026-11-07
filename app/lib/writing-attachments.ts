import type { WritingFile } from "./writing-file-types";

export function writingUploadMessage(text: string, files: WritingFile[]) {
  if (!files.length) return text;
  return [text.trim(), "已存入写写工作区：", ...files.map((file) => `📄 ${file.name}`)].filter(Boolean).join("\n");
}
