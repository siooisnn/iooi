type WorkMessage = { role: string; content: string; source?: string; roundId?: string; image?: string; images?: string[] };

function imageCount(message: WorkMessage) {
  return new Set([message.image, ...(Array.isArray(message.images) ? message.images : [])].filter(Boolean)).size;
}

export function workContextHistory(messages: WorkMessage[], project: "iooi" | "summer", currentRound?: string) {
  return messages.filter((message) => message.source === `code_task_${project}`
    && (message.role === "user" || message.role === "assistant") && (!currentRound || message.roundId !== currentRound))
    .map((message, index) => {
      // Earlier screenshots are not re-sent; the note keeps the text history coherent.
      const count = imageCount(message);
      const note = count ? `[当时附了 ${count} 张图片，本轮不再附带]` : "";
      return { index, role: message.role as "user" | "assistant", content: [message.content, note].filter(Boolean).join("\n") };
    });
}
