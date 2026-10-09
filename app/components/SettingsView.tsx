"use client";

import { useState } from "react";
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

// Settings View
export const TODAY_STATES = [
  "happy", "lucky", "chill", "busy", "studying", "thinking",
  "sleepy", "exhausted", "low mood", "broken", "missing you",
];

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
  const [stateOpen, setStateOpen] = useState(false);
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

  function pickTodayState(value: string) {
    updateSettings({ todayState: value });
    setStateOpen(false);
  }

  function customTodayState() {
    const next = window.prompt("Today's State:", settings.todayState);
    if (next !== null) pickTodayState(next.trim().slice(0, 40));
  }

  // Every card is open on one page; no sub-pages.
  return (
    <>
      <section className="settings-body">
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

        <div className="settings-group settings-state-card">
          <button type="button" className="settings-state-head" aria-expanded={stateOpen} onClick={() => setStateOpen((open) => !open)}>
            <span className="settings-group-title">Today&apos;s State</span>
            <span className="settings-state-value">{settings.todayState || "Not set"}</span>
            <svg className="settings-state-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {stateOpen && (
            <div className="settings-state-options" role="group" aria-label="Today's State">
              {TODAY_STATES.map((value) => (
                <button type="button" key={value}
                  className={`settings-state-chip${settings.todayState === value ? " settings-state-chip-active" : ""}`}
                  aria-pressed={settings.todayState === value}
                  onClick={() => pickTodayState(value)}>{value}</button>
              ))}
              <button type="button" className="settings-state-chip settings-state-chip-quiet" onClick={customTodayState}>custom…</button>
              {settings.todayState && (
                <button type="button" className="settings-state-chip settings-state-chip-quiet" onClick={() => pickTodayState("")}>clear</button>
              )}
            </div>
          )}
        </div>

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
      <PageBack onBack={onBack} />
    </>
  );
}
