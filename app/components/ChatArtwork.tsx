"use client";

import { Fragment, useMemo, useState } from "react";
import { artworkChunks, type ArtworkDraft } from "../lib/artworks";
import { renderContent } from "./ChatContent";
import { ArtworkPreview } from "./ArtworkPreview";

/** Used only by completed ordinary private-chat assistant replies. Never auto-run code. */
export function ChatArtwork({ content, part = "all" }: { content: string; part?: "all" | "text" | "cards" }) {
  const [open, setOpen] = useState<ArtworkDraft | null>(null);
  const chunks = useMemo(() => artworkChunks(content), [content]);
  const text = chunks.filter((chunk) => chunk.kind === "text").map((chunk) => chunk.text.trim()).filter(Boolean).join("\n\n");
  return <>
    {part === "text" ? renderContent(text) : chunks.map((chunk, i) => chunk.kind === "text"
      ? part !== "cards" && <Fragment key={i}>{renderContent(chunk.text)}</Fragment>
      : <div className="aw-chat-code" key={i}>
      <div className="aw-code-head"><span>{chunk.artwork?.title || chunk.language || "代码"}</span>{chunk.artwork && <button type="button" onClick={() => setOpen(chunk.artwork!)}>预览小作品</button>}</div>
      <details><summary>查看代码{chunk.language ? ` · ${chunk.language}` : ""}</summary><pre><code>{chunk.text}</code></pre></details>
    </div>)}
    {open && <ArtworkPreview artwork={open} onClose={() => setOpen(null)} />}
  </>;
}
