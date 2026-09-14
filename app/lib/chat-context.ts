export type ChatContextMessage = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  file?: string;
};

export type ChatContextMode = "full-window" | "rolling-summary";

type ChatContextOptions = {
  mode: ChatContextMode;
  maxUserTurns: number;
  mediaTail?: number;
};

export function buildChatContext(
  messages: ChatContextMessage[],
  { mode, maxUserTurns, mediaTail = 5 }: ChatContextOptions,
) {
  // Same-role text bubbles may be joined for the model, but their text is kept
  // verbatim. Media bubbles remain separate so attachments stay associated
  // with the right caption.
  const merged: ChatContextMessage[] = [];
  for (const message of messages) {
    const last = merged[merged.length - 1];
    if (
      last
      && last.role === message.role
      && !message.image
      && !message.file
      && !last.image
      && !last.file
    ) {
      last.content += `\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }

  let startIndex = 0;
  if (mode === "rolling-summary") {
    let userTurns = 0;
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      if (merged[index].role !== "user") continue;
      userTurns += 1;
      if (userTurns >= maxUserTurns) {
        startIndex = index;
        break;
      }
    }
  }

  const contextTruncated = mode === "rolling-summary" && startIndex > 0;
  let contextMessages = merged.slice(startIndex);
  if (contextMessages[0]?.role === "assistant") {
    contextMessages = [
      { role: "user", content: "【接续之前的对话】" },
      ...contextMessages,
    ];
  }

  const keepMediaFrom = Math.max(0, contextMessages.length - mediaTail);
  contextMessages = contextMessages.map((message, index) => (
    index >= keepMediaFrom
      ? message
      : { role: message.role, content: message.content }
  ));

  const contextUserTurns = contextMessages.filter((message) => message.role === "user").length;
  return {
    messages: contextMessages,
    stats: {
      context_messages: contextMessages.length,
      context_user_turns: contextUserTurns,
      context_chars: contextMessages.reduce((total, message) => total + message.content.length, 0),
      context_window_rounds: mode === "full-window" ? contextUserTurns : maxUserTurns,
      context_mode: mode,
      context_truncated: contextTruncated,
      context_omitted_messages: contextTruncated ? startIndex : 0,
    },
  };
}
