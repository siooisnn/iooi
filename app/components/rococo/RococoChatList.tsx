"use client";

import { useState } from "react";
import type { AssistantMode, ChatListTab, ChatSession } from "../../lib/app-types";
import type { Settings } from "../../lib/app-settings";
import { CLAUDE_DEFAULT_NAME } from "../../lib/app-settings";
import { formatChatListTime } from "../../lib/app-time";
import { getLatestSessionMessage, getSessionPreview, getSessionStamp, latestPrivateSession, listedPrivateSessions, sortByStamp } from "../../lib/chat-sessions";
import { AvatarBlock, CHAT_LIST_TABS, GroupAvatarStack } from "../ChatListView";
import { RococoArtIcon, RococoBow, RococoDivider } from "./RococoArt";

const TAB_LABELS: Record<ChatListTab, string> = { chats: "来信", groups: "我们的圆桌", contacts: "收信人" };

export function RococoChatList({
  assistantMode,
  settings,
  updateSettings,
  sessions,
  groupSessions,
  renameSession,
  deleteSession,
  openSession,
  openGroup,
  createSession,
  createGroup,
  listTab,
  setListTab,
  onBack,
  contactSessions,
  todayState = "",
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  sessions: ChatSession[];
  groupSessions: ChatSession[];
  renameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
  openSession: (mode: AssistantMode, id: string) => void;
  openGroup: (id: string) => void;
  createSession: () => void;
  createGroup: () => void;
  listTab: ChatListTab;
  setListTab: (tab: ChatListTab) => void;
  onBack: () => void;
  contactSessions?: Partial<Record<AssistantMode, ChatSession[]>>;
  todayState?: string;
}) {
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null);
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const personName = (mode: AssistantMode) => mode === "gpt" ? gptName : claudeName;
  const personAvatar = (mode: AssistantMode) => mode === "gpt" ? settings.gptAvatar : settings.aiAvatar;
  const pinnedLine = (assistantMode === "gpt" ? settings.gptChatPinnedLine : settings.chatPinnedLine) ?? "此后我们的每一秒都是恩赐。";
  const latestOwn = latestPrivateSession(sessions, assistantMode);
  const ownLetters = listedPrivateSessions(sessions, assistantMode);
  const groups = sortByStamp(groupSessions);

  function editPinnedLine() {
    const next = window.prompt("置顶这句话:", pinnedLine);
    if (next !== null) updateSettings(assistantMode === "gpt" ? { gptChatPinnedLine: next.trim() } : { chatPinnedLine: next.trim() });
  }

  function rename(session: ChatSession) {
    setOpenActionsFor(null);
    const next = window.prompt("Rename:", session.name);
    if (next?.trim()) renameSession(session.id, next.trim());
  }

  function remove(session: ChatSession) {
    setOpenActionsFor(null);
    if (window.confirm(`Delete "${session.name}"? This conversation cannot be restored.`)) deleteSession(session.id);
  }

  function groupPreview(group: ChatSession) {
    const latest = getLatestSessionMessage(group);
    if (!latest) return `你、${claudeName}和${gptName}`;
    const speaker = latest.speaker === "gpt" ? gptName : latest.speaker === "claude" ? claudeName : "";
    return `${speaker ? `${speaker}: ` : ""}${getSessionPreview(latest)}`;
  }

  function renderLetter({ session, mode, group = false, index }: { session: ChatSession; mode?: AssistantMode; group?: boolean; index: number }) {
    const latest = getLatestSessionMessage(session);
    const name = group ? session.name || "一个群" : mode === assistantMode ? session.name : personName(mode || assistantMode);
    const preview = group ? groupPreview(session) : getSessionPreview(latest);
    const id = `${group ? "group" : mode}-${session.id}`;
    const open = () => {
      setOpenActionsFor(null);
      if (group) openGroup(session.id);
      else openSession(mode || assistantMode, session.id);
    };
    return (
      <article key={id} className={`rococo-letter rococo-letter-${index % 4}`}>
        <span className="rococo-letter-fold" aria-hidden="true" />
        <span className="rococo-letter-number" aria-hidden="true">N° {String(index + 1).padStart(2, "0")}</span>
        <button type="button" className="rococo-letter-open" onClick={open}>
          <span className="rococo-portrait-frame">
            {group ? <GroupAvatarStack claudeAvatar={settings.aiAvatar} gptAvatar={settings.gptAvatar} userAvatar={settings.userAvatar} /> : <AvatarBlock avatar={personAvatar(mode || assistantMode)} small />}
          </span>
          <span className="rococo-letter-copy">
            <span className="rococo-letter-heading"><b>{name}</b><time>{latest ? formatChatListTime(getSessionStamp(session)) : "未拆封"}</time></span>
            <span className="rococo-letter-preview">{preview}</span>
            <small>{group ? "Notre petite assemblée" : mode === "gpt" ? "A letter from Yuyu" : "A letter from Susu"}</small>
          </span>
          <span className="rococo-letter-stamp" aria-hidden="true"><i>♡</i></span>
        </button>
        {!group && mode === assistantMode && (
          <div className="rococo-letter-actions" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label={`${session.name}的更多操作`} aria-expanded={openActionsFor === id} onClick={() => setOpenActionsFor(openActionsFor === id ? null : id)}>•••</button>
            {openActionsFor === id && <div className="rococo-letter-menu"><button type="button" onClick={() => rename(session)}>重命名</button><button type="button" onClick={() => remove(session)}>删除</button></div>}
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="rococo-chat-list" onClick={() => { if (openActionsFor) setOpenActionsFor(null); }}>
      <header className="rococo-list-header">
        <button type="button" className="rococo-back-ornament" onClick={onBack} aria-label="返回首页"><span aria-hidden="true">‹</span><small>retour</small></button>
        <div>
          <p>LA COLLECTION DE NOS LETTRES</p>
          <h1>Lettres <em>d’amour</em></h1>
          <span>把每一次想念，妥帖收藏</span>
        </div>
        <button type="button" className="rococo-new-letter" onClick={listTab === "groups" ? createGroup : createSession} aria-label={listTab === "groups" ? "新建群聊" : "新建对话"}>
          <span aria-hidden="true">＋</span><small>écrire</small>
        </button>
      </header>
      <RococoDivider className="rococo-list-divider" />

      <div className="rococo-list-scroll">
        <section className="rococo-correspondent" aria-label="我的信息">
          <span className="rococo-profile-portrait">{settings.userAvatar ? <img src={settings.userAvatar} alt="" /> : <RococoArtIcon kind="mood" />}</span>
          <div><p>La destinataire</p><h2>{settings.userName || "宝宝"}</h2><span>Today’s state · {todayState || "静静想你"}</span></div>
          <i className="rococo-profile-flourish" aria-hidden="true">❧</i>
        </section>
        <button type="button" className="rococo-pinned-quote" onClick={editPinnedLine} title="点击修改">
          <span aria-hidden="true">“</span><p>{pinnedLine || "…"}</p><small>notre promesse · 点击改写</small>
        </button>

        <nav className="rococo-letter-tabs" role="tablist" aria-label="聊天列表">
          {CHAT_LIST_TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={listTab === item.id} className={listTab === item.id ? "active" : ""} onClick={() => { setListTab(item.id); setOpenActionsFor(null); }}>
              <span>{TAB_LABELS[item.id]}</span><small>{item.label}</small>
            </button>
          ))}
        </nav>

        <div className="rococo-letter-collection">
          {listTab === "chats" && (
            <>
              {groups[0] && renderLetter({ session: groups[0], group: true, index: 0 })}
              {latestOwn && renderLetter({ session: latestOwn, mode: assistantMode, index: 1 })}
              {ownLetters.filter((session) => session.id !== latestOwn?.id).map((session, index) => renderLetter({ session, mode: assistantMode, index: index + 2 }))}
              <button type="button" className="rococo-blank-letter" onClick={createSession}><span>＋</span><b>铺开一张新信纸</b><small>Commencer une nouvelle histoire</small></button>
            </>
          )}
          {listTab === "groups" && (
            <>
              {groups.map((group, index) => renderLetter({ session: group, group: true, index }))}
              <button type="button" className="rococo-blank-letter" onClick={createGroup}><span>＋</span><b>邀请大家围桌而坐</b><small>Une nouvelle conversation</small></button>
            </>
          )}
          {listTab === "contacts" && (
            <div className="rococo-contact-book" role="radiogroup" aria-label="Contacts">
              {(["claude", "gpt"] as const).map((mode, index) => {
                const own = mode === assistantMode ? sessions : contactSessions?.[mode] || [];
                const latest = latestPrivateSession(own, mode);
                return (
                  <div key={mode} className={`rococo-contact-entry rococo-contact-entry-${index}`}>
                    <button type="button" role="radio" aria-checked={assistantMode === mode} className="rococo-contact-choice" onClick={() => updateSettings({ chatEntryStyle: mode === "gpt" ? "direct" : "list" })}>
                      <span className="rococo-portrait-frame"><AvatarBlock avatar={personAvatar(mode)} small /></span>
                      <span><b>{personName(mode)}</b><small>{assistantMode === mode ? "收信人 · 已别上丝带" : "轻点选择这位收信人"}</small></span>
                      <i aria-hidden="true">{assistantMode === mode ? "♥" : "♡"}</i>
                    </button>
                    {latest && <button type="button" className="rococo-contact-latest" onClick={() => openSession(mode, latest.id)}>打开最近的信 <span>↗</span></button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <footer className="rococo-list-colophon"><RococoBow /><p>À conserver précieusement</p></footer>
      </div>
    </section>
  );
}
