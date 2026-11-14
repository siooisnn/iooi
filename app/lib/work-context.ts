import type { CodeProject } from "./code-projects";

type WorkMessage = { role: string; content: string; source?: string; roundId?: string; image?: string; images?: string[]; file?: string; fileName?: string };

function imageCount(message: WorkMessage) {
  return new Set([message.image, ...(Array.isArray(message.images) ? message.images : [])].filter(Boolean)).size;
}

export function workContextHistory(messages: WorkMessage[], project: CodeProject, currentRound?: string) {
  return messages.filter((message) => message.source === `code_task_${project}`
    && (message.role === "user" || message.role === "assistant") && (!currentRound || message.roundId !== currentRound))
    .map((message, index) => {
      // Earlier screenshots and files are not re-sent; the notes keep the text history coherent.
      const count = imageCount(message);
      const notes = [
        count ? `[当时附了 ${count} 张图片，本轮不再附带]` : "",
        message.file ? `[当时附了文件 ${message.fileName || "（未命名）"}，本轮不再附带全文]` : "",
      ];
      return { index, role: message.role as "user" | "assistant", content: [message.content, ...notes].filter(Boolean).join("\n") };
    });
}
