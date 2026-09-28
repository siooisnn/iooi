export function workContextHistory(messages: Array<{ role: string; content: string; source?: string; roundId?: string }>, project: "iooi" | "summer", currentRound?: string) {
  return messages.filter((message) => message.source === `code_task_${project}`
    && (message.role === "user" || message.role === "assistant") && (!currentRound || message.roundId !== currentRound))
    .map((message, index) => ({ index, role: message.role as "user" | "assistant", content: message.content }));
}
