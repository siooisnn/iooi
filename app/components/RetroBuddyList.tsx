"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AssistantMode, ChatSession } from "../lib/app-types";
import { formatChatListTime } from "../lib/app-time";
import { getLatestSessionMessage, getSessionPreview, getSessionStamp } from "../lib/chat-sessions";
import { useTogether } from "./HomeView";
import { ChatGlyph } from "./RetroDesktop";

/* The chat list as an MSN Messenger buddy list, circa 2007. Only while retro
   mode is on; ChatListView hands over everything it already worked out, so
   tapping a row does exactly what the gray list does. */

type Contact = {
  mode: AssistantMode;
  name: string;
  latest?: ChatSession;
};

function Buddy() {
  return <i className="xp-buddy-dot" aria-hidden="true" />;
}

/** A little two-tone speech bubble for an old conversation window. */
function WindowGlyph() {
  return (
    <svg className="xp-buddy-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.5h12v7H7l-3 2.5v-2.5H2z" fill="#fff" stroke="#3c6fb6" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M4.5 6h7M4.5 8h5" stroke="#8fb2e3" strokeWidth="1" />
    </svg>
  );
}

function PlusGlyph({ tint }: { tint: "green" | "blue" }) {
  return (
    <svg className="xp-buddy-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill={tint === "green" ? "#4fb52e" : "#2f74df"} stroke={tint === "green" ? "#1d6a12" : "#173a73"} strokeWidth="1" />
      <path d="M8 4.8v6.4M4.8 8h6.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GroupHeader({ open, label, count, onToggle }: { open: boolean; label: ReactNode; count: number; onToggle: () => void }) {
  return (
    <button type="button" className="xp-buddy-group" aria-expanded={open} onClick={onToggle}>
      <i className={`xp-buddy-caret${open ? " xp-buddy-caret-open" : ""}`} aria-hidden="true" />
      <span>{label} ({count})</span>
    </button>
  );
}

export function RetroBuddyList({
  userName,
  userAvatar,
  todayState,
  pinnedLine,
  startDate,
  assistantMode,
  contacts,
  groups,
  pastOwn,
  groupPreview,
  onEditPinned,
  onPickContact,
  onOpenContact,
  onOpenSession,
  onOpenGroup,
  onNewChat,
  onNewGroup,
  onRename,
  onDelete,
  onClose,
}: {
  userName: string;
  userAvatar: string;
  todayState: string;
  pinnedLine: string;
  startDate: string;
  // Whoever is ticked: "以前的对话" and 新对话 follow them.
  assistantMode: AssistantMode;
  contacts: Contact[];
  groups: ChatSession[];
  pastOwn: ChatSession[];
  groupPreview: (group: ChatSession) => string;
  onEditPinned: () => void;
  onPickContact: (mode: AssistantMode) => void;
  onOpenContact: (contact: Contact) => void;
  onOpenSession: (id: string) => void;
  onOpenGroup: (id: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onRename: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
  onClose: () => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { days, ready } = useTogether(startDate);
  const ticked = contacts.find((contact) => contact.mode === assistantMode);
  const toggle = (key: string) => setClosed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="xp-buddy-screen" onClick={() => setMenuFor(null)}>
      <section className="xp-buddy-window" aria-label="聊天列表">
        <header className="xp-buddy-titlebar">
          <span className="xp-buddy-title-icon" aria-hidden="true"><ChatGlyph /></span>
          <h1 className="xp-buddy-title">iooi Messenger</h1>
          <div className="xp-buddy-controls">
            <i className="xp-buddy-btn xp-buddy-min" aria-hidden="true" />
            <i className="xp-buddy-btn xp-buddy-max" aria-hidden="true" />
            <button type="button" className="xp-buddy-btn xp-buddy-close" onClick={onClose} aria-label="关闭窗口，回到桌面" title="关闭">
              <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
            </button>
          </div>
        </header>

        <div className="xp-buddy-me">
          <span className="xp-buddy-photo" aria-hidden="true">
            {userAvatar ? <img src={userAvatar} alt="" /> : <span />}
          </span>
          <div className="xp-buddy-me-text">
            <p className="xp-buddy-me-name">
              <b>{userName}</b>
              <span className="xp-buddy-me-status">({todayState || "在线"})</span>
            </p>
            <button type="button" className="xp-buddy-psm" onClick={(e) => { e.stopPropagation(); onEditPinned(); }} title="点击修改个人消息">
              {pinnedLine ? pinnedLine : <span className="xp-buddy-psm-empty">&lt;输入个人消息&gt;</span>}
            </button>
          </div>
        </div>

        <div className="xp-buddy-toolbar">
          <button type="button" className="xp-buddy-tool" onClick={onNewChat} title={`和${ticked?.name || "TA"}开一个新窗口`}>
            <PlusGlyph tint="green" />新对话
          </button>
          <button type="button" className="xp-buddy-tool" onClick={onNewGroup} title="开一个新的群聊窗口">
            <PlusGlyph tint="blue" />新群聊
          </button>
        </div>

        <div className="xp-buddy-list">
          <GroupHeader open={!closed.online} label="在线" count={contacts.length} onToggle={() => toggle("online")} />
          {!closed.online && (
            <div className="xp-buddy-rows" role="radiogroup" aria-label="默认联系人">
              {contacts.map((contact) => {
                const latest = contact.latest ? getLatestSessionMessage(contact.latest) : undefined;
                const picked = contact.mode === assistantMode;
                return (
                  <div key={contact.mode} className={`xp-buddy-row${picked ? " xp-buddy-row-picked" : ""}`}>
                    <button type="button" className="xp-buddy-open" onClick={() => onOpenContact(contact)}>
                      <Buddy />
                      <span className="xp-buddy-line">
                        <b>{contact.name}</b>
                        <span className="xp-buddy-sub"> - {getSessionPreview(latest)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      className="xp-buddy-radio"
                      onClick={() => onPickContact(contact.mode)}
                      aria-label={`把${contact.name}设为默认联系人`}
                      title="默认联系人：新对话和以前的对话都跟着 TA"
                    >
                      <i aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <GroupHeader open={!closed.groups} label="群聊" count={groups.length} onToggle={() => toggle("groups")} />
          {!closed.groups && (
            <div className="xp-buddy-rows">
              {groups.length === 0 && <p className="xp-buddy-empty">还没有群聊</p>}
              {groups.map((group, index) => (
                <div key={group.id} className="xp-buddy-row">
                  <button type="button" className="xp-buddy-open" onClick={() => onOpenGroup(group.id)}>
                    <span className="xp-buddy-group-icon" aria-hidden="true"><ChatGlyph /></span>
                    <span className="xp-buddy-line">
                      <b>{index === 0 ? "一个群 (3 人)" : group.name}</b>
                      <span className="xp-buddy-sub"> - {groupPreview(group)}</span>
                    </span>
                    <span className="xp-buddy-time">{group.messages.length > 0 ? formatChatListTime(getSessionStamp(group)) : ""}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <GroupHeader
            open={!closed.past}
            label={<>以前和 {ticked?.name || "TA"} 的对话</>}
            count={pastOwn.length}
            onToggle={() => toggle("past")}
          />
          {!closed.past && (
            <div className="xp-buddy-rows">
              {pastOwn.length === 0 && <p className="xp-buddy-empty">没有更多历史窗口</p>}
              {pastOwn.map((session) => (
                <div key={session.id} className="xp-buddy-row">
                  <button type="button" className="xp-buddy-open" onClick={() => onOpenSession(session.id)}>
                    <WindowGlyph />
                    <span className="xp-buddy-line">
                      <b>{session.name}</b>
                      <span className="xp-buddy-sub"> - {getSessionPreview(getLatestSessionMessage(session))}</span>
                    </span>
                    <span className="xp-buddy-time">{formatChatListTime(getSessionStamp(session))}</span>
                  </button>
                  <button
                    type="button"
                    className="xp-buddy-more"
                    aria-label={`${session.name} 的更多操作`}
                    aria-expanded={menuFor === session.id}
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === session.id ? null : session.id); }}
                  >
                    <i aria-hidden="true" />
                  </button>
                  {menuFor === session.id && (
                    <div className="xp-buddy-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onOpenSession(session.id); }}><b>打开(O)</b></button>
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onRename(session); }}>重命名(M)…</button>
                      <hr />
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onDelete(session); }}>删除(D)</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="xp-buddy-today">
          <span className="xp-buddy-today-heart" aria-hidden="true">♥</span>
          <span>iooi Today：{ready ? <>我们已经在一起 <b>{days}</b> 天了</> : "正在连接…"}</span>
        </footer>
      </section>
    </div>
  );
}
