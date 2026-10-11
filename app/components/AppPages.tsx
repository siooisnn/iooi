"use client";

import { PageBack } from "./PageBack";
import type { LifeEntry, LifeKind } from "@/app/lib/life-log";

const KIND_LABEL: Record<LifeKind, string> = { care: "找你", comment: "留言", post: "写日志" };

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
              {entry.note && <p className="hb-log-note">{entry.note}</p>}
            </div>
          ))
        )}
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
