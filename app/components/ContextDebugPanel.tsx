"use client";

import { useState } from "react";
import type { CacheStats } from "./CacheStatusPanel";

type ContextDebugPanelProps = {
  cache: CacheStats | null;
  sessionMessageCount: number;
  sessionUserTurns: number;
};

export function ContextDebugPanel({
  cache,
  sessionMessageCount,
  sessionUserTurns,
}: ContextDebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-group">
      <button
        className="settings-group-title"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          textAlign: "left",
          width: "fit-content",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 700,
          color: "#8a7d75",
        }}
        onClick={() => setOpen(!open)}
      >
        上下文调试
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </button>
      {open && (
        <div style={{ fontSize: "13px", color: "#6b5b53", lineHeight: 2 }}>
          <div>当前会话:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{sessionMessageCount} 条 / {sessionUserTurns} 轮用户</span></div>
          <div>长期记忆:<span style={{ marginLeft: "8px", color: cache?.summer_used ? "#5b8a6b" : "var(--text-light)" }}>{cache?.summer_used ? "summer" : "等待下一轮确认"}</span></div>
          {cache ? (
            <>
              <div>上轮实际发送:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{cache.context_messages ?? "-"} 条 / {cache.context_user_turns ?? "-"} 轮用户</span></div>
              <div>窗口上限:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{cache.context_window_rounds ?? 30} 轮用户</span></div>
              <div>是否截断:<span style={{ marginLeft: "8px", color: cache.context_truncated ? "var(--accent-text)" : "#5b8a6b" }}>
                {cache.context_truncated ? `是，省略 ${cache.context_omitted_messages ?? 0} 条更早消息` : "否"}
              </span></div>
              {typeof cache.context_chars === "number" && (
                <div>上轮文字量:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{cache.context_chars} 字符</span></div>
              )}
              <div>旧摘要/旧记忆:<span style={{ marginLeft: "8px", color: "var(--text-light)" }}>不再注入</span></div>
            </>
          ) : (
            <p className="settings-hint">还没有上一轮发送记录。</p>
          )}
          <p className="settings-hint" style={{ marginTop: "6px" }}>
            这里只显示数量和来源，不显示具体记忆内容。
          </p>
        </div>
      )}
    </div>
  );
}
