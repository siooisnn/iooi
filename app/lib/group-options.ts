export const GROUP_SPEAKERS = ["claude", "gpt", "deepseek"] as const;
export type GroupSpeaker = typeof GROUP_SPEAKERS[number];
export type GroupOptions = { mode: "chat" | "writing"; participants: GroupSpeaker[]; gptModel: string };
export function groupOptions(value?: Partial<GroupOptions>): GroupOptions {
  const participants = Array.isArray(value?.participants)
    ? GROUP_SPEAKERS.filter((speaker) => value.participants!.includes(speaker)) : [...GROUP_SPEAKERS];
  return { mode: value?.mode === "writing" ? "writing" : "chat", participants,
    gptModel: value?.gptModel || "openai/gpt-6.1-sol" };
}
export function groupTargets(text: string, participants: GroupSpeaker[], names: Record<GroupSpeaker, string>, previous?: GroupSpeaker | null): GroupSpeaker[] {
  const aliases: Record<GroupSpeaker, string[]> = { claude: [names.claude, "Claude"], gpt: [names.gpt, "GPT"], deepseek: [names.deepseek, "DeepSeek"] };
  const mentioned = GROUP_SPEAKERS.filter((speaker) => aliases[speaker].some((name) => name && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$|[，。！？、,.!?])`, "i").test(text)));
  if (mentioned.length) return mentioned.filter((speaker) => participants.includes(speaker));
  const start = previous ? participants.indexOf(previous) + 1 : 0;
  return [...participants.slice(start), ...participants.slice(0, start)];
}
