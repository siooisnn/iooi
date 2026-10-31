"use client";

import { useState } from "react";
import { apiFetch } from "../lib/client-api";
import type { WritingFile } from "../lib/writing-file-types";

export function WritingDownloads({ files }: { files: WritingFile[] }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function download(file: WritingFile) {
    if (busy) return;
    setBusy(file.id);
    setError("");
    try {
      const response = await apiFetch(`/api/writing/files/${encodeURIComponent(file.id)}`);
      if (!response.ok) throw new Error(response.status === 401 ? "登录状态失效，请重新打开小窝后再下载。" : "文件暂时无法下载，请稍后再试。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name.split(/[\\/]/).pop() || "文档";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "下载失败，请稍后再试。");
    } finally {
      setBusy("");
    }
  }

  return <div className="writing-downloads" aria-label="本轮文档下载">
    {files.map((file) => <button key={file.id} type="button" className="msg-bubble msg-bubble-ai writing-download-card"
      disabled={Boolean(busy)} onClick={() => void download(file)} aria-label={`下载 ${file.name}`}>
      <span className="writing-download-icon" aria-hidden>📄</span>
      <span className="writing-download-info"><span>{file.name}</span>
        <small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`} · 本次保存的版本</small>
      </span>
      <span className="writing-download-action">{busy === file.id ? "下载中…" : "下载"}</span>
    </button>)}
    {error && <p className="composer-upload-error" role="alert">{error}</p>}
  </div>;
}
