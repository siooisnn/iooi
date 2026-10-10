"use client";

import { useRef, useState } from "react";
import { CacheStatusPanel } from "./CacheStatusPanel";
import { ContextDebugPanel } from "./ContextDebugPanel";
import { NotificationButton } from "./NotificationButton";
import { ChatBackgroundSetting } from "./ChatBackgroundSetting";
import { PageBack } from "./PageBack";
import { HOME_BACKGROUND_SIZE } from "../lib/chat-background";
import type { CacheStats, ChatSession } from "../lib/app-types";
import { CLAUDE_DEFAULT_NAME } from "../lib/app-settings";
import type { Settings } from "../lib/app-settings";
import { apiFetch } from "../lib/client-api";
import { GearGlyph } from "./RetroDesktop";

const CONTROL_SECTIONS = [
  { title: "外观与身份", items: [{ label: "姓名与头像", index: 0 }, { label: "桌面背景", index: 1 }, { label: "聊天背景", index: 2 }] },
  { title: "日常与提醒", items: [{ label: "主动关怀", index: 3 }, { label: "天气与城市", index: 4 }, { label: "纪念日", index: 5 }, { label: "消息通知", index: 6 }] },
  { title: "运行信息", items: [{ label: "酥酥 · 缓存", index: 7 }, { label: "酥酥 · 上下文", index: 8 }, { label: "郁郁 · 缓存", index: 9 }, { label: "郁郁 · 上下文", index: 10 }] },
];

// Settings View
// 酥酥 and 郁郁 share one settings page: names and avatars in a list,
// then each one's cache and context panels.
export function SettingsView({
  settings,
  updateSettings,
  onBack,
  claudeCache,
  claudeSession,
  gptCache,
  gptSession,
}: {
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  onBack: () => void;
  claudeCache: CacheStats | null;
  claudeSession?: ChatSession;
  gptCache: CacheStats | null;
  gptSession?: ChatSession;
}) {
  const settingsRef = useRef<HTMLElement>(null);
  // Phones fold the blue task pane behind one bar instead of a system <select>.
  const [directoryOpen, setDirectoryOpen] = useState(false);
  function jumpTo(index: number) {
    setDirectoryOpen(false);
    settingsRef.current?.children[index]?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  function handleAvatarUpload(field: "aiAvatar" | "gptAvatar" | "userAvatar") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // Resize to 128x128
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext("2d")!;
          const size = Math.min(img.width, img.height);
          const x = (img.width - size) / 2;
          const y = (img.height - size) / 2;
          ctx.drawImage(img, x, y, size, size, 0, 0, 128, 128);
          updateSettings({ [field]: canvas.toDataURL("image/jpeg", 0.8) });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  const aiName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";

  // Every card is open on one page; no sub-pages.
  const content = (
      <section className="settings-body" ref={settingsRef} aria-label="设置项目">
        <div className="settings-group">
          <h2 className="settings-group-title">Name &amp; Avatar</h2>
          <div className="avatar-list">
            {([
              { field: "aiAvatar", nameField: "aiName", placeholder: "avatar-ai", who: "酥酥" },
              { field: "gptAvatar", nameField: "gptName", placeholder: "avatar-ai", who: "郁郁" },
              { field: "userAvatar", nameField: "userName", placeholder: "avatar-user", who: "me" },
            ] as const).map(({ field, nameField, placeholder, who }) => (
              <div className="avatar-list-row" key={field}>
                <button type="button" className="avatar-list-photo" aria-label={`Change ${who}'s avatar`} onClick={() => handleAvatarUpload(field)}>
                  {settings[field]
                    ? <img src={settings[field]} className="avatar-upload-preview" alt="" />
                    : <div className={`avatar-upload-placeholder ${placeholder}`} />}
                </button>
                <label className="avatar-list-name">
                  <input
                    className="avatar-list-input"
                    value={settings[nameField]}
                    aria-label={`${who}'s name`}
                    enterKeyHint="done"
                    onChange={(e) => updateSettings({ [nameField]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <svg className="avatar-list-pencil" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
                </label>
              </div>
            ))}
          </div>
        </div>

        <ChatBackgroundSetting
          title="Home Background"
          hint="A photo behind the desktop's glass. Remove it to go back to gray. Saved automatically."
          background={settings.homeBackground}
          onChange={(homeBackground) => updateSettings({ homeBackground })}
          size={HOME_BACKGROUND_SIZE}
        />

        <ChatBackgroundSetting
          title="Chat Background"
          hint={`One photo for every chat: ${aiName}, ${gptName} and the group. Remove it to go back to gray. Saved automatically.`}
          background={settings.classicChatBackground}
          onChange={(classicChatBackground) => updateSettings({ classicChatBackground })}
        />

        <div className="settings-group">
          <h2 className="settings-group-title">Proactive Care</h2>
          <p className="settings-hint">When off, heartbeat only checks in quietly: no messages, no push notifications.</p>
          <button
            className={`model-option ${settings.proactiveCare ? "model-option-active" : ""}`}
            onClick={() => updateSettings({ proactiveCare: !settings.proactiveCare })}
          >
            <span className="model-option-dot" />
            {settings.proactiveCare ? "On" : "Off"}
          </button>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">Weather</h2>
          <p className="settings-hint">{aiName} knows the current weather and can bring it up naturally.</p>
          <input
            className="settings-input settings-input-full"
            placeholder="City, e.g. Beijing, Shanghai"
            value={settings.city}
            onChange={(e) => updateSettings({ city: e.target.value })}
          />
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">Anniversary</h2>
          <div className="settings-row">
            <label className="settings-label" htmlFor="settings-start-date">Together since</label>
            <input
              id="settings-start-date"
              className="settings-input"
              type="date"
              value={settings.startDate}
              onChange={(e) => updateSettings({ startDate: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-group">
            <h2 className="settings-group-title">Notifications</h2>
            <p className="settings-hint">Push to your phone when {aiName} writes first.</p>
            <NotificationButton
              onSubscribe={(subscription) =>
                apiFetch("/api/push", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(subscription),
                }).then((res) => {
                  if (!res.ok) throw new Error("subscribe failed");
                })
              }
              loadPublicKey={() =>
                apiFetch("/api/push")
                  .then((res) => (res.ok ? res.json() : null))
                  .then((data: { publicKey?: string | null } | null) => data?.publicKey || null)
              }
              onTest={() =>
                apiFetch("/api/push/test", { method: "POST" })
                  .then((res) => res.json())
                  .then((data: { summary?: string }) => data.summary || "Sent")
              }
            />
          </div>

        <CacheStatusPanel cache={claudeCache} title={`缓存命中 · ${aiName}`} />
        <ContextDebugPanel
          title={`上下文调试 · ${aiName}`}
          cache={claudeCache}
          sessionMessageCount={claudeSession?.messages.length ?? 0}
          sessionUserTurns={claudeSession?.messages.filter((m) => m.role === "user").length ?? 0}
        />

        <CacheStatusPanel cache={gptCache} title={`缓存命中 · ${gptName}`} />
        <ContextDebugPanel
          title={`上下文调试 · ${gptName}`}
          cache={gptCache}
          sessionMessageCount={gptSession?.messages.length ?? 0}
          sessionUserTurns={gptSession?.messages.filter((m) => m.role === "user").length ?? 0}
        />
      </section>
  );

  if (!settings.retroDesktop) return <>{content}<PageBack onBack={onBack} /></>;

  return (
    <div className="xp-summer-screen xp-control-screen">
      <section className="xp-summer-window" aria-label="控制面板">
        <header className="xp-summer-titlebar">
          <span className="xp-control-title-icon"><GearGlyph /></span><h1>控制面板</h1>
          <div className="xp-summer-controls">
            <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
            <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
            <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口，回到桌面" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
          </div>
        </header>
        <div className="xp-summer-address"><span>地址</span><span className="xp-summer-address-field"><span className="xp-control-title-icon"><GearGlyph /></span><b>控制面板</b></span></div>
        <div className="xp-control-mobile-bar">
          <button type="button" className="xp-control-mobile-directory" aria-expanded={directoryOpen} aria-controls="xp-control-navigation" onClick={() => setDirectoryOpen((open) => !open)}>
            <span className="xp-control-title-icon"><GearGlyph /></span>
            <span>跳到设置项目</span>
            <i aria-hidden="true" />
          </button>
        </div>
        <div className="xp-control-browser">
          <nav className="xp-control-navigation" id="xp-control-navigation" aria-label="控制面板目录" data-open={directoryOpen || undefined}>
            <div className="xp-control-nav-heading"><GearGlyph /><h2>控制面板</h2></div>
            {CONTROL_SECTIONS.map((group) => (
              <section className="xp-control-task-group" key={group.title}>
                <h3>{group.title}</h3>
                <div>{group.items.map((item) => <button type="button" key={item.index} onClick={() => jumpTo(item.index)}><span aria-hidden="true">›</span>{item.label}</button>)}</div>
              </section>
            ))}
          </nav>
          {content}
        </div>
        <footer className="xp-summer-statusbar"><span>11 个设置项目</span><span>更改后自动保存</span></footer>
      </section>
    </div>
  );
}
