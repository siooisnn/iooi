"use client";

import { PageBack } from "./PageBack";
import type { LifeEntry, LifeKind } from "@/app/lib/life-log";

const KIND_LABEL: Record<LifeKind, string> = { care: "找你", comment: "留言", post: "写日志", read: "读书", surf: "冲浪" };

// Only plain web links are clickable; anything else stays text.
function safeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : "";
}

/** heartbeat: what 酥酥 did on his own, newest first. Quiet beats are not shown. */
export function HeartbeatView({ log, onBack }: { log: LifeEntry[]; onBack: () => void }) {
  return (
    <>
      <section className="diary-body heartbeat-body">
        {log.length === 0 ? (
          <p className="chat-entry-empty">还没有记录</p>
        ) : (
          log.map((entry) => (
            <div key={`${entry.at}-${entry.kind}`} className="hb-log-item">
              <div className="hb-log-head">
                <span className="hb-log-time">{entry.time}</span>
                <span className="hb-log-action">{KIND_LABEL[entry.kind]}</span>
              </div>
              <p className="hb-log-reason">{entry.text}</p>
              {entry.links?.length ? (
                <ul className="hb-log-links">
                  {entry.links.map((link) => (
                    <li key={link.url}>
                      {safeUrl(link.url) ? (
                        <a href={safeUrl(link.url)} target="_blank" rel="noopener noreferrer nofollow">{link.title}</a>
                      ) : link.title}
                      {link.why && <span>{link.why}</span>}
                    </li>
                  ))}
                </ul>
              ) : null}
              {entry.note && <p className="hb-log-note">{entry.note}</p>}
            </div>
          ))
        )}
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
