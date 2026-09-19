type TimedMessage = { role?: string; content?: string; date?: string; time?: string; source?: string; roundId?: string };

// Stored chat times are China Standard Time, regardless of the server/device zone.
export function messageTimestamp(message?: TimedMessage): number {
  const date = message?.date?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  const time = message?.time?.match(/(\d{1,2}):(\d{2})/);
  if (!date) return 0;
  return Date.UTC(+date[1], +date[2] - 1, +date[3], +(time?.[1] || 0) - 8, +(time?.[2] || 0));
}

export function latestUserSession<T extends { id: string; kind?: string; messages?: TimedMessage[] }>(sessions: T[]): T | undefined {
  let latest: T | undefined;
  let latestStamp = 0;
  for (const session of sessions) {
    if (session.kind === "memo" || session.kind === "group") continue;
    for (const message of session.messages || []) {
      if (message.role !== "user" || message.source?.startsWith("summer_")) continue;
      const stamp = messageTimestamp(message);
      if (stamp > latestStamp) {
        latestStamp = stamp;
        latest = session;
      }
    }
  }
  return latest;
}

// Old read notices were deduplicated across the whole window, overwriting the
// first notice's time. Display them with their adjacent reply, without editing data.
export function alignLegacySummerCalls<T extends TimedMessage>(messages: T[]): T[] {
  return messages.map((message, index) => {
    if (message.source !== "summer_call" || message.roundId) return message;
    for (let next = index + 1; next < messages.length; next++) {
      const reply = messages[next];
      if (reply.role === "user") break;
      if (!reply.source?.startsWith("summer_") && reply.date && reply.time) {
        return { ...message, date: reply.date, time: reply.time };
      }
    }
    return message;
  });
}
