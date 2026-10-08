"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Image from "next/image";
import { prepareChatBackground } from "../lib/chat-background";

export function ChatBackgroundSetting({ title, hint, current = false, background, onChange }: {
  title: string;
  hint: string;
  /** The chat theme in use right now, so the owner knows which photo shows. */
  current?: boolean;
  background: string;
  onChange: (background: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      onChange(await prepareChatBackground(file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "图片读取失败，请重新选择。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-group">
      <h2 className="settings-group-title">{title}{current ? " · 当前主题" : ""}</h2>
      <input ref={inputRef} type="file" className="attach-file-input" accept="image/*"
        disabled={busy} aria-label={`选择${title}图片`} onChange={(event) => void upload(event)} />
      {background && <Image className="chat-background-preview" src={background} alt={`当前的${title}`} width={100} height={145} unoptimized />}
      <div className="chat-background-actions">
        <button type="button" className="model-option" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "处理图片中…" : background ? "更换照片" : "选择照片"}
        </button>
        {background && (
          <button type="button" className="model-option" disabled={busy} onClick={() => { onChange(""); setError(""); }}>
            移除背景
          </button>
        )}
      </div>
      <p className="settings-hint">{hint}</p>
      {error && <p className="settings-hint" role="alert">{error}</p>}
    </div>
  );
}
