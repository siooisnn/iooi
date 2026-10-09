"use client";

import { Fragment, useState } from "react";
import type { ReactNode } from "react";

// ── Markdown ──
export function renderContent(text: string) {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
    return (
      <Fragment key={lineIndex}>
        {parts.filter(Boolean).map((part, partIndex) => {
          const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
          if (link) {
            return (
              <a key={partIndex} className="chat-message-link" href={link[2]} target="_blank" rel="noopener noreferrer">
                {link[1]}
              </a>
            );
          }
          if (part.startsWith("**") && part.endsWith("**")) return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
          if (part.startsWith("*") && part.endsWith("*")) return <em key={partIndex}>{part.slice(1, -1)}</em>;
          return <span key={partIndex}>{part}</span>;
        })}
        {lineIndex < text.split("\n").length - 1 && <br />}
      </Fragment>
    );
  });
}

export function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen(!open)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Thought Process</span>
      </button>
      {open && (
        <div className="thinking-content">
          {content.split("\n").map((line, i) => (
            <span key={i}>{line}{i < content.split("\n").length - 1 && <br />}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSummerCard({
  title,
  content,
  defaultOpen = false,
  children,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="summer-collapse">
      <button className="summer-collapse-toggle" onClick={() => setOpen(!open)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{title}</span>
      </button>
      {open && <div className="summer-collapse-content">{renderContent(content)}</div>}
      {children}
    </div>
  );
}
