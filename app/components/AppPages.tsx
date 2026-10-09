"use client";

import { PageBack } from "./PageBack";
import { IconLineBook } from "./NavIcons";

export type HeartbeatEntry = { time: string; action: string; reason: string };

/** heartbeat: 酥酥's quiet check-ins, newest first. */
export function HeartbeatView({ log, onBack }: { log: HeartbeatEntry[]; onBack: () => void }) {
  return (
    <>
      <section className="diary-body heartbeat-body">
        {log.length === 0 ? (
          <p className="chat-entry-empty">还没有记录</p>
        ) : (
          log.map((entry, i) => (
            <div key={i} className="hb-log-item">
              <span className="hb-log-time">{entry.time}</span>
              <p className="hb-log-reason">{entry.reason}</p>
              {entry.action && <span className="hb-log-action">{entry.action}</span>}
            </div>
          ))
        )}
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}

/** reading: not decided yet, so the page only holds its place. */
export function ReadingView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <section className="diary-body reading-body">
        <div className="reading-empty">
          <IconLineBook size={36} />
          <p>这里还空着</p>
        </div>
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
