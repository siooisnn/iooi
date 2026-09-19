export type StreamReply = {
  reply?: string;
  thinking?: string;
  status?: number;
  cache?: Record<string, unknown>;
};

/** Read the NDJSON chat protocol while preserving the existing JSON fallback. */
export async function readChatResponse<T extends StreamReply>(
  response: Response,
  onDelta: (text: string) => void,
): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/x-ndjson")) return response.json() as Promise<T>;
  if (!response.body) throw new SyntaxError("流式回复没有响应内容");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingDelta = "";
  let finalEvent: T | null = null;

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as T & { type?: string; text?: string };
    if (event.type === "delta" && typeof event.text === "string") {
      pendingDelta += event.text;
    } else if (event.type === "done" || event.type === "error") {
      finalEvent = event;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) consumeLine(line);
    if (pendingDelta) {
      onDelta(pendingDelta);
      pendingDelta = "";
    }
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer);
  if (pendingDelta) onDelta(pendingDelta);
  if (!finalEvent) throw new SyntaxError("流式回复未正常结束");
  return finalEvent;
}
