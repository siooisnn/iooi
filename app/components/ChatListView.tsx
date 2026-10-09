"use client";

import { useState, useRef } from "react";
import type { CSSProperties } from "react";
import type { AssistantMode, ChatListTab, ChatSession } from "../lib/app-types";
import { CLAUDE_DEFAULT_NAME } from "../lib/app-settings";
import type { Settings } from "../lib/app-settings";
import { formatChatListTime } from "../lib/app-time";
import { getLatestSessionMessage, getSessionPreview, getSessionStamp, latestPrivateSession, listedPrivateSessions, sortByStamp } from "../lib/chat-sessions";
import { PageBack } from "./PageBack";
import { RetroBuddyList } from "./RetroBuddyList";

export const CHAT_LIST_TABS: Array<{ id: ChatListTab; label: string }> = [
  { id: "chats", label: "Chats" },
  { id: "groups", label: "Groups" },
  { id: "contacts", label: "Contacts" },
];

export function ChatListView({
  assistantMode,
  settings,
  updateSettings,
  sessions,
  groupSessions,
  renameSession,
  deleteSession,
  openSession: openPrivateSession,
  openGroup,
  createSession,
  createGroup,
  listTab,
  setListTab,
  onBack,
  retro = false,
  contactSessions,
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  // Windows of the person ticked in Contacts.
  sessions: ChatSession[];
  groupSessions: ChatSession[];
  renameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
  openSession: (mode: AssistantMode, id: string) => void;
  openGroup: (id: string) => void;
  // A new window with whoever is ticked in Contacts.
  createSession: () => void;
  createGroup: () => void;
  listTab: ChatListTab;
  setListTab: (tab: ChatListTab) => void;
  onBack: () => void;
  // Retro mode shows the list as an MSN buddy list.
  retro?: boolean;
  // Both people's windows, so each buddy can open their own latest chat.
  contactSessions?: Partial<Record<AssistantMode, ChatSession[]>>;
}) {
  const isGpt = assistantMode === "gpt";
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const personName = (mode: AssistantMode) => mode === "gpt" ? gptName : claudeName;
  const personAvatar = (mode: AssistantMode) => mode === "gpt" ? settings.gptAvatar : settings.aiAvatar;
  const assistantAvatar = personAvatar(assistantMode);
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null);
  const swipeRef = useRef<{ id: string; startX: number; startY: number; dx: number; dy: number; dragging: boolean } | null>(null);
  const blockClickRef = useRef(false);

  const latestOwn = latestPrivateSession(sessions, assistantMode);
  const pastOwn = listedPrivateSessions(sessions, assistantMode).filter((s) => s.id !== latestOwn?.id);
  const groupsByStamp = sortByStamp(groupSessions);
  const latestGroup = groupsByStamp[0];
  const pastGroups = groupsByStamp.slice(1);
  const pinnedLine = (isGpt ? settings.gptChatPinnedLine : settings.chatPinnedLine) ?? "此后我们的每一秒都是恩赐。";

  function openSession(id: string) {
    setOpenActionsFor(null);
    openPrivateSession(assistantMode, id);
  }

  function editPinnedLine() {
    const next = window.prompt("置顶这句话:", pinnedLine);
    if (next !== null) {
      updateSettings(isGpt ? { gptChatPinnedLine: next.trim() } : { chatPinnedLine: next.trim() });
    }
  }

  function handleRename(session: ChatSession) {
    setOpenActionsFor(null);
    const next = window.prompt("Rename:", session.name);
    if (next && next.trim()) renameSession(session.id, next.trim());
  }

  function handleDelete(session: ChatSession) {
    setOpenActionsFor(null);
    if (window.confirm(`Delete "${session.name}"? This conversation cannot be restored.`)) {
      deleteSession(session.id);
    }
  }

  function handleSwipeStart(session: ChatSession, e: React.PointerEvent<HTMLElement>) {
    swipeRef.current = { id: session.id, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, dragging: false };
    if (openActionsFor && openActionsFor !== session.id) setOpenActionsFor(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handleSwipeMove(e: React.PointerEvent<HTMLElement>) {
    const swipe = swipeRef.current;
    if (!swipe) return;
    swipe.dx = e.clientX - swipe.startX;
    swipe.dy = e.clientY - swipe.startY;
    if (Math.abs(swipe.dx) > 18 && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.6) {
      swipe.dragging = true;
      e.preventDefault();
    }
  }

  function handleSwipeEnd() {
    const swipe = swipeRef.current;
    if (!swipe) return;
    if (swipe.dragging) {
      blockClickRef.current = true;
      window.setTimeout(() => { blockClickRef.current = false; }, 0);
      if (swipe.dx < -72 && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.6) setOpenActionsFor(swipe.id);
      if (swipe.dx > 36) setOpenActionsFor(null);
    }
    swipeRef.current = null;
  }

  function handleSwipeClick(session: ChatSession) {
    if (blockClickRef.current) return;
    if (openActionsFor === session.id) {
      setOpenActionsFor(null);
      return;
    }
    openSession(session.id);
  }

  function SwipeSessionRow({ session }: { session: ChatSession }) {
    return (
      <div className="chat-swipe-shell">
        <div className={`chat-swipe-actions ${openActionsFor === session.id ? "chat-swipe-actions-open" : ""}`} aria-hidden={openActionsFor !== session.id}>
          <button className="chat-swipe-action chat-swipe-rename" onClick={(e) => { e.stopPropagation(); handleRename(session); }}>Rename</button>
          <button className="chat-swipe-action chat-swipe-delete" onClick={(e) => { e.stopPropagation(); handleDelete(session); }}>Delete</button>
        </div>
        <div
          className={`chat-entry-item ${openActionsFor === session.id ? "chat-swipe-open" : ""}`}
          onPointerDown={(e) => handleSwipeStart(session, e)}
          onPointerMove={handleSwipeMove}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={handleSwipeEnd}
          onClick={(e) => { e.stopPropagation(); handleSwipeClick(session); }}
        >
          <AvatarBlock avatar={assistantAvatar} small />
          <div className="chat-entry-main">
            <div className="chat-entry-row">
              <span className="chat-entry-name">{session.name}</span>
            </div>
            <p className="chat-entry-preview">{getSessionPreview(getLatestSessionMessage(session))}</p>
          </div>
          <span className="chat-entry-side">
            <span className="chat-entry-time">{formatChatListTime(getSessionStamp(session))}</span>
          </span>
        </div>
      </div>
    );
  }

  function groupPreview(group: ChatSession) {
    const latest = getLatestSessionMessage(group);
    if (!latest) return `你、${claudeName}和${gptName}`;
    const speaker = latest.speaker === "gpt" ? gptName : latest.speaker === "claude" ? claudeName : "";
    return `${speaker ? `${speaker}: ` : ""}${getSessionPreview(latest)}`;
  }

  function groupRow(group: ChatSession, latest = false) {
    const hasMessages = group.messages.length > 0;
    return (
      <button key={group.id} type="button" className="chat-entry-item chat-entry-group" onClick={() => openGroup(group.id)}>
        <GroupAvatarStack
          claudeAvatar={settings.aiAvatar}
          gptAvatar={settings.gptAvatar}
          userAvatar={settings.userAvatar}
        />
        <div className="chat-entry-main">
          <div className="chat-entry-row">
            <span className="chat-entry-name">{latest ? "一个群" : group.name}</span>
          </div>
          <p className="chat-entry-preview">{groupPreview(group)}</p>
        </div>
        <span className="chat-entry-side">
          <span className="chat-entry-time">{hasMessages ? formatChatListTime(getSessionStamp(group)) : ""}</span>
          {latest && <span className="chat-entry-tag">3 人</span>}
        </span>
      </button>
    );
  }

  function personRow(mode: AssistantMode, session: ChatSession) {
    const latest = getLatestSessionMessage(session);
    return (
      <button key={`${mode}-${session.id}`} type="button" className="chat-entry-item chat-entry-person" onClick={() => {
        setOpenActionsFor(null);
        openPrivateSession(mode, session.id);
      }}>
        <AvatarBlock avatar={personAvatar(mode)} small />
        <div className="chat-entry-main">
          <div className="chat-entry-row">
            <span className="chat-entry-name">{personName(mode)}</span>
          </div>
          <p className="chat-entry-preview">{getSessionPreview(latest)}</p>
        </div>
        <span className="chat-entry-side">
          <span className="chat-entry-time">{latest ? formatChatListTime(getSessionStamp(session)) : ""}</span>
        </span>
      </button>
    );
  }

  if (retro) {
    const contacts = (["claude", "gpt"] as const).map((mode) => {
      const own = mode === assistantMode ? sessions : contactSessions?.[mode] || [];
      return { mode, name: personName(mode), latest: latestPrivateSession(own, mode) };
    });
    return (
      <RetroBuddyList
        userName={settings.userName || "宝宝"}
        userAvatar={settings.userAvatar}
        todayState={settings.todayState}
        pinnedLine={pinnedLine}
        startDate={settings.startDate}
        assistantMode={assistantMode}
        contacts={contacts}
        groups={groupsByStamp}
        pastOwn={pastOwn}
        groupPreview={groupPreview}
        onEditPinned={editPinnedLine}
        onPickContact={(mode) => updateSettings({ chatEntryStyle: mode === "gpt" ? "direct" : "list" })}
        onOpenContact={(contact) => {
          if (contact.latest) openPrivateSession(contact.mode, contact.latest.id);
          else if (contact.mode === assistantMode) createSession();
          // No window with them yet: tick them first, then 新对话 opens one.
          else updateSettings({ chatEntryStyle: contact.mode === "gpt" ? "direct" : "list" });
        }}
        onOpenSession={openSession}
        onOpenGroup={openGroup}
        onNewChat={createSession}
        onNewGroup={createGroup}
        onRename={handleRename}
        onDelete={handleDelete}
        onClose={onBack}
      />
    );
  }

  const tabIndex = CHAT_LIST_TABS.findIndex((item) => item.id === listTab);

  return (
    <>
      <section className="chat-entry-body chat-list-home" onClick={() => setOpenActionsFor(null)}>
        <div className="chat-list-profile-card">
          <div className="chat-list-profile">
            <span className="chat-list-profile-avatar" aria-hidden="true">
              {settings.userAvatar ? <img src={settings.userAvatar} alt="" /> : <span />}
            </span>
            <div className="chat-list-profile-text">
              <h1 className="chat-list-profile-name">{settings.userName || "宝宝"}</h1>
              <p className="chat-list-profile-state">
                Today&apos;s State: <span>{settings.todayState || "—"}</span>
              </p>
            </div>
          </div>

          <button type="button" className="chat-list-quote" onClick={editPinnedLine} title="点击修改">
            “{pinnedLine || "…"}”
          </button>
        </div>

        <div className="chat-list-tabs" role="tablist" aria-label="聊天列表"
          style={{ "--chat-list-tab-index": Math.max(0, tabIndex) } as CSSProperties}>
          <span className="chat-list-tabs-thumb" aria-hidden="true" />
          {CHAT_LIST_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={listTab === item.id}
              className={`chat-list-tab${listTab === item.id ? " chat-list-tab-active" : ""}`}
              onClick={() => { setOpenActionsFor(null); setListTab(item.id); }}
            >{item.label}</button>
          ))}
        </div>

        {listTab === "chats" && (
          <>
            <div className="chat-list-card">
              {latestGroup && groupRow(latestGroup, true)}
              {latestOwn && personRow(assistantMode, latestOwn)}
            </div>
            <div className="chat-list-card">
              <button type="button" className="chat-entry-item chat-list-new-group" onClick={() => { setOpenActionsFor(null); createSession(); }}>
                <PlusAvatar />
                <div className="chat-entry-main">
                  <div className="chat-entry-row"><span className="chat-entry-name">New chat</span></div>
                  <p className="chat-entry-preview">开一个新窗口</p>
                </div>
              </button>
            </div>
            <div className="chat-list-card">
              {pastOwn.length === 0
                ? <p className="chat-entry-empty">没有更多历史窗口</p>
                : pastOwn.map((session) => <SwipeSessionRow key={session.id} session={session} />)}
            </div>
          </>
        )}

        {listTab === "groups" && (
          <>
            {latestGroup && (
              <div className="chat-list-card">
                {groupRow(latestGroup, true)}
              </div>
            )}
            <div className="chat-list-card">
              <button type="button" className="chat-entry-item chat-list-new-group" onClick={createGroup}>
                <PlusAvatar />
                <div className="chat-entry-main">
                  <div className="chat-entry-row"><span className="chat-entry-name">New group</span></div>
                  <p className="chat-entry-preview">开一个新的群聊窗口</p>
                </div>
              </button>
            </div>
            <div className="chat-list-card">
              {pastGroups.length === 0
                ? <p className="chat-entry-empty">没有更多群聊窗口</p>
                : pastGroups.map((group) => groupRow(group))}
            </div>
          </>
        )}

        {listTab === "contacts" && (
          <div className="chat-list-card" role="radiogroup" aria-label="Contacts">
            {(["claude", "gpt"] as const).map((mode) => {
              const selected = assistantMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="chat-entry-item chat-entry-contact"
                  onClick={() => updateSettings({ chatEntryStyle: mode === "gpt" ? "direct" : "list" })}
                >
                  <AvatarBlock avatar={personAvatar(mode)} small />
                  <div className="chat-entry-main">
                    <div className="chat-entry-row">
                      <span className="chat-entry-name">{personName(mode)}</span>
                    </div>
                  </div>
                  <span className="chat-entry-side chat-entry-check" aria-hidden="true">
                    {selected && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="5 12.5 10 17.5 19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}

function PlusAvatar() {
  return (
    <span className="chat-entry-avatar chat-entry-avatar-small chat-list-plus-avatar" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  );
}

export function AvatarBlock({ avatar, small }: { avatar: string; small: boolean }) {
  return (
    <span className={`chat-entry-avatar ${small ? "chat-entry-avatar-small" : ""}`}>
      {avatar ? <img src={avatar} alt="" /> : <span />}
    </span>
  );
}

export function GroupAvatarStack({
  claudeAvatar,
  gptAvatar,
  userAvatar,
}: {
  claudeAvatar: string;
  gptAvatar: string;
  userAvatar: string;
}) {
  const members = [claudeAvatar, gptAvatar, userAvatar];
  return (
    <span className="chat-entry-avatar chat-entry-avatar-small group-avatar-stack" aria-hidden="true">
      {members.map((avatar, index) => (
        <span key={index} className={`group-avatar-chip group-avatar-chip-${index + 1}`}>
          {avatar ? <img src={avatar} alt="" /> : <i />}
        </span>
      ))}
    </span>
  );
}
