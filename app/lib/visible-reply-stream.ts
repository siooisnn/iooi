type HiddenSection = "summer" | "mood" | null;

const OPENERS = [
  { text: "[summer_remember", section: "summer" as const },
  { text: "[心情:", section: "mood" as const },
  { text: "[心情：", section: "mood" as const },
];

function longestPossibleOpenerSuffix(value: string): number {
  const maxLength = Math.min(value.length, Math.max(...OPENERS.map((item) => item.text.length)) - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = value.slice(-length).toLowerCase();
    if (OPENERS.some((item) => item.text.toLowerCase().startsWith(suffix))) return length;
  }
  return 0;
}

/**
 * Removes model-only metadata without waiting for the complete answer. It keeps
 * a short boundary buffer so markers split across stdout chunks never flash in
 * the chat bubble.
 */
export function createVisibleReplyStream() {
  let buffer = "";
  let hidden: HiddenSection = null;

  function push(chunk: string): string {
    buffer += chunk;
    let visible = "";

    while (buffer) {
      if (hidden) {
        const closer = hidden === "summer" ? "[/summer_remember]" : "]";
        const closerIndex = buffer.toLowerCase().indexOf(closer.toLowerCase());
        if (closerIndex < 0) {
          // Hidden proposal content can be long. Only its possible closing
          // marker prefix must stay buffered.
          const keep = Math.min(buffer.length, closer.length - 1);
          buffer = buffer.slice(-keep);
          break;
        }
        buffer = buffer.slice(closerIndex + closer.length);
        hidden = null;
        continue;
      }

      const lower = buffer.toLowerCase();
      const opener = OPENERS
        .map((item) => ({ ...item, index: lower.indexOf(item.text.toLowerCase()) }))
        .filter((item) => item.index >= 0)
        .sort((left, right) => left.index - right.index)[0];
      if (opener) {
        visible += buffer.slice(0, opener.index);
        buffer = buffer.slice(opener.index + opener.text.length);
        hidden = opener.section;
        continue;
      }

      const heldLength = longestPossibleOpenerSuffix(buffer);
      visible += heldLength ? buffer.slice(0, -heldLength) : buffer;
      buffer = heldLength ? buffer.slice(-heldLength) : "";
      break;
    }

    return visible;
  }

  function finish(): string {
    if (hidden) {
      buffer = "";
      return "";
    }
    const visible = buffer;
    buffer = "";
    return visible;
  }

  return { push, finish };
}
