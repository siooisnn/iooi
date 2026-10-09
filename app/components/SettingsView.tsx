"use client";

import { useState } from "react";
import { CacheStatusPanel } from "./CacheStatusPanel";
import { ContextDebugPanel } from "./ContextDebugPanel";
import { NotificationButton } from "./NotificationButton";
import { ChatBackgroundSetting } from "./ChatBackgroundSetting";
import { PageBack } from "./PageBack";
import { resolveGptModel } from "../lib/gpt-models";
import { HOME_BACKGROUND_SIZE } from "../lib/chat-background";
import type { CacheStats, ChatSession } from "../lib/app-types";
import { BUBBLE_COLORS, CLAUDE_DEFAULT_NAME, CONTEXT_WINDOW_ROUNDS } from "../lib/app-settings";
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
  updateGptSummary,
}: {
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  onBack: () => void;
  claudeCache: CacheStats | null;
  claudeSession?: ChatSession;
  gptCache: CacheStats | null;
  gptSession?: ChatSession;
  updateGptSummary: (summary: string, until: number) => void;
}) {
  // The manual 会话缓存 is 郁郁's; 酥酥's windows compress on their own.
  const session = gptSession;
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheMessage, setCacheMessage] = useState("");
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

  function manualCacheSlice() {
    const messages = session?.messages || [];
    let userTurns = 0;
    let startIdx = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userTurns++;
        if (userTurns >= CONTEXT_WINDOW_ROUNDS) {
          startIdx = i;
          break;
        }
      }
    }
    const already = session?.summarizedUntil || 0;
    const until = Math.max(0, startIdx);
    const from = Math.min(already, until);
    const slice = messages.slice(from, until).filter((m) => m.role === "user" || m.role === "assistant");
    return { slice, until, omitted: until };
  }

  async function generateSessionCache() {
    if (!session) return;
    const { slice, until, omitted } = manualCacheSlice();
    if (until <= 0 || slice.length === 0) {
      setCacheMessage("现在还没有需要压进缓存的旧消息。");
      return;
    }
    setCacheBusy(true);
    setCacheMessage("");
    try {
      const res = await apiFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousSummary: session.summary || "",
          messages: slice.map((m) => ({ role: m.role, content: m.content })),
          aiName: "GPT",
          modelId: resolveGptModel(settings.gptModel).apiId,
          reasoningEffort: settings.gptReasoningEffort,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.summary) {
        throw new Error(data.reason || "生成失败");
      }
      updateGptSummary(String(data.summary).trim(), until);
      setCacheMessage(`已生成本窗口缓存，覆盖 ${omitted} 条更早消息。下轮聊天会带上。`);
    } catch (err) {
      setCacheMessage(err instanceof Error ? `生成失败：${err.message}` : "生成失败");
    } finally {
      setCacheBusy(false);
    }
  }

  const manualCache = manualCacheSlice();
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

        <div className="settings-group">
          <h2 className="settings-group-title">Bubble Color</h2>
          <p className="settings-hint">Your bubbles, with white text.</p>
          <div className="model-options">
            {BUBBLE_COLORS.map((option) => (
              <button
                key={option.value}
                className={`model-option ${settings.bubbleColor === option.value ? "model-option-active" : ""}`}
                aria-pressed={settings.bubbleColor === option.value}
                onClick={() => updateSettings({ bubbleColor: option.value })}
              >
                <span className="settings-bubble-swatch" style={{ background: option.color }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

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

        <div className="settings-group">
          <h2 className="settings-group-title">会话缓存 · {gptName}</h2>
          <p className="settings-hint">
            把当前窗口已经滑出 30 轮外的旧聊天压成一段前情，后续聊天会带上。
          </p>
          <button
            className={`model-option ${session?.summary ? "model-option-active" : ""}`}
            onClick={generateSessionCache}
            disabled={cacheBusy || !session || manualCache.until <= 0}
          >
            <span className="model-option-dot" />
            {cacheBusy ? "生成中" : "生成本窗口缓存"}
          </button>
          <p className="settings-hint">
            当前可压缩：{manualCache.slice.length} 条；已缓存长度：{session?.summary?.length || 0} 字
          </p>
          {cacheMessage && <p className="settings-hint" style={cacheMessage.startsWith("生成失败") ? { color: "var(--text-primary)", fontWeight: 600 } : undefined}>{cacheMessage}</p>}
        </div>

        <CacheStatusPanel cache={gptCache} title={`缓存命中 · ${gptName}`} />
        <ContextDebugPanel
          title={`上下文调试 · ${gptName}`}
          cache={gptCache}
          sessionMessageCount={session?.messages.length ?? 0}
          sessionUserTurns={session?.messages.filter((m) => m.role === "user").length ?? 0}
        />
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
