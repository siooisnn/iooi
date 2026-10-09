"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Image from "next/image";
import { prepareChatBackground } from "../lib/chat-background";

export function ChatBackgroundSetting({ title, hint, background, onChange, size }: {
  title: string;
  hint: string;
  background: string;
  onChange: (background: string) => void;
  size?: { maxSide: number; maxLength: number };
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
      onChange(await prepareChatBackground(file, size));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn't read that image. Please pick another.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-group">
      <h2 className="settings-group-title">{title}</h2>
      <input ref={inputRef} type="file" className="attach-file-input" accept="image/*"
        disabled={busy} aria-label={`Choose a ${title} photo`} onChange={(event) => void upload(event)} />
      {background && <Image className="chat-background-preview" src={background} alt={`Current ${title}`} width={100} height={145} unoptimized />}
      <div className="chat-background-actions">
        <button type="button" className="model-option" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Processing…" : background ? "Change photo" : "Choose photo"}
        </button>
        {background && (
          <button type="button" className="model-option" disabled={busy} onClick={() => { onChange(""); setError(""); }}>
            Remove
          </button>
        )}
      </div>
      <p className="settings-hint">{hint}</p>
      {error && <p className="settings-hint" role="alert">{error}</p>}
    </div>
  );
}
