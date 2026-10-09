"use client";

import { useState } from "react";
import type { FragmentEntry } from "../lib/app-types";
import { APP_TIME_ZONE } from "../lib/app-time";
import { genId } from "../lib/chat-sessions";
import { IconLineSnowflake } from "./NavIcons";

export function formatFragmentDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function FragmentsView({ fragments, setFragments, onClose }: {
  fragments: FragmentEntry[];
  setFragments: React.Dispatch<React.SetStateAction<FragmentEntry[]>>;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shareState, setShareState] = useState("");
  const activeFragment = fragments.find((fragment) => fragment.id === editingId) || null;
  const orderedFragments = [...fragments].sort((a, b) =>
    new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );

  function createFragment() {
    const now = new Date().toISOString();
    const fragment: FragmentEntry = {
      id: `fragment-${genId()}`,
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    setFragments((current) => [fragment, ...current]);
    setEditingId(fragment.id);
    setShareState("");
  }

  function updateFragment(content: string) {
    if (!editingId) return;
    const updatedAt = new Date().toISOString();
    setFragments((current) => current.map((fragment) => fragment.id === editingId
      ? { ...fragment, content, updatedAt }
      : fragment));
  }

  function closeEditor() {
    if (activeFragment && !activeFragment.content.trim()) {
      setFragments((current) => current.filter((fragment) => fragment.id !== activeFragment.id));
    }
    setEditingId(null);
    setShareState("");
  }

  function deleteFragment() {
    if (!activeFragment) return;
    if (!window.confirm("要丢掉这片文字吗？删除后不能恢复。")) return;
    setFragments((current) => current.filter((fragment) => fragment.id !== activeFragment.id));
    setEditingId(null);
    setShareState("");
  }

  async function shareFragment() {
    if (!activeFragment?.content.trim()) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "碎片", text: activeFragment.content });
        setShareState("已分享");
      } else {
        await navigator.clipboard.writeText(activeFragment.content);
        setShareState("已复制");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(activeFragment.content);
        setShareState("已复制");
      } catch {
        setShareState("分享失败");
      }
    }
  }

  if (activeFragment) {
    return (
      <div className="fragment-overlay fragment-editor-overlay">
        <header className="fragment-header fragment-editor-header">
          <button type="button" className="fragment-round-button" onClick={closeEditor} aria-label="返回碎片列表">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="fragment-editor-heading">
            <b>碎片</b>
            <span>{formatFragmentDate(activeFragment.updatedAt, true)}</span>
          </div>
          <div className="fragment-editor-actions">
            <button type="button" onClick={() => void shareFragment()} aria-label="分享碎片">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><polyline points="7 8 12 3 17 8" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
            </button>
            <button type="button" onClick={deleteFragment} aria-label="删除碎片">···</button>
          </div>
        </header>
        <main className="fragment-paper">
          <div className="fragment-book-spine" aria-hidden />
          <textarea
            autoFocus
            value={activeFragment.content}
            onChange={(event) => updateFragment(event.target.value)}
            placeholder="捡起一片……"
            aria-label="碎片正文"
          />
        </main>
        <footer className="fragment-save-state">
          <span>{shareState || "已自动保存"}</span><i><IconLineSnowflake size={14} /></i>
        </footer>
      </div>
    );
  }

  return (
    <div className="fragment-overlay">
      <header className="fragment-header">
        <button type="button" className="fragment-round-button" onClick={onClose} aria-label="返回桌面">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="fragment-page-heading">
          <h2>winter</h2>
          <p>碎片化时代，我选择碎片化写作。</p>
        </div>
        <button type="button" className="fragment-round-button fragment-add-button" onClick={createFragment} aria-label="新建碎片">＋</button>
      </header>

      <main className="fragment-list-body">
        {orderedFragments.length === 0 ? (
          <div className="fragment-empty">
            <div className="fragment-empty-visual" aria-hidden>
              <svg viewBox="0 0 180 110" fill="none">
                <path d="M18 34c25-9 47-5 72 11v49c-25-14-48-18-72-9V34z" />
                <path d="M162 34c-25-9-47-5-72 11v49c25-14 48-18 72-9V34z" />
                <path d="M90 45v49" />
                <path d="M30 47c17-4 32-1 47 7M30 59c17-4 32-1 47 7M150 47c-17-4-32-1-47 7" />
              </svg>
              <span><IconLineSnowflake size={22} /></span>
            </div>
            <h3>还没有碎片。</h3>
            <p>先捡起一片，慢慢拼成一本书。</p>
            <button type="button" onClick={createFragment}>捡起一片</button>
          </div>
        ) : (
          <div className="fragment-pages">
            {orderedFragments.map((fragment, index) => (
              <button type="button" className="fragment-page-card" key={fragment.id} onClick={() => { setEditingId(fragment.id); setShareState(""); }}>
                <span className="fragment-page-number"><IconLineSnowflake size={12} /> {String(orderedFragments.length - index).padStart(2, "0")}</span>
                <p>{fragment.content || "未写完的这一片……"}</p>
                <time>{formatFragmentDate(fragment.updatedAt || fragment.createdAt)}</time>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
