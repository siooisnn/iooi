"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { AssistantMode, ChatListTab, ChatSession } from "../../lib/app-types";
import type { Settings } from "../../lib/app-settings";
import { CLAUDE_DEFAULT_NAME } from "../../lib/app-settings";
import { APP_TIME_ZONE } from "../../lib/app-time";
import { CODE_PROJECT_LABELS, sessionWorkProject } from "../../lib/code-projects";
import { getLatestSessionMessage, getSessionPreview, getSessionStamp, latestPrivateSession, listedPrivateSessions, sortByStamp } from "../../lib/chat-sessions";
import { CHAT_LIST_TABS } from "../ChatListView";
import { useLetterChrome } from "./LetterArt";
import { LetterFoldSprig, LetterListVine, LetterPaperBloom, LetterPosy } from "./LetterFlowers";

/* The white love-letter chat list: the table of contents to the home
   page's preface. The page itself is composed loosely (title to the left,
   a climbing rose reaching in from the right, the search a blank line on
   the paper, one faint rose pressed into the corner), but the letters
   underneath keep one calm reading order. Only the newest
   ten are laid out; the rest stay folded until she asks for them. */

const PAGE_SIZE = 10;

const TAB_COPY: Record<ChatListTab, { label: string; heading: string }> = {
  chats: { label: "来信", heading: "Newest first" },
  groups: { label: "圆桌", heading: "Round the table" },
  contacts: { label: "收信人", heading: "Written to" },
};

type Entry = { key: string; session: ChatSession; group: boolean };

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 09:16, 昨天, 周四, 11月2日, 2025.11.2 — the way a letter is dated. */
export function letterListTime(date: Date, now = new Date()) {
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff <= 0) return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  if (diff === 1) return "昨天";
  if (diff < 7) return WEEKDAYS[date.getDay()];
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

function matches(session: ChatSession, query: string) {
  if (!query) return true;
  if ((session.name || "").toLowerCase().includes(query)) return true;
  return session.messages.some((message) => typeof message.content === "string" && message.content.toLowerCase().includes(query));
}

export function LetterChatList({
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
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const personName = (mode: AssistantMode) => mode === "gpt" ? gptName : claudeName;
  const personAvatar = (mode: AssistantMode) => mode === "gpt" ? settings.gptAvatar : settings.aiAvatar;
  const pinnedLine = (assistantMode === "gpt" ? settings.gptChatPinnedLine : settings.chatPinnedLine) ?? "此后我们的每一秒都是恩赐。";
  const copy = TAB_COPY[listTab];

  useLetterChrome(true);

  const entries = useMemo<Entry[]>(() => {
    const groups = sortByStamp(groupSessions);
    if (listTab === "groups") return groups.map((session) => ({ key: `group-${session.id}`, session, group: true }));
    if (listTab !== "chats") return [];
    const own = listedPrivateSessions(sessions, assistantMode);
    const latest = latestPrivateSession(sessions, assistantMode);
    // An untouched draft is still the window ＋ reuses, so it stays listed.
    if (latest && !own.some((session) => session.id === latest.id)) own.unshift(latest);
    const list: Entry[] = own.map((session) => ({ key: `own-${session.id}`, session, group: false }));
    if (groups[0]) list.push({ key: `group-${groups[0].id}`, session: groups[0], group: true });
    return list.sort((a, b) => getSessionStamp(b.session).getTime() - getSessionStamp(a.session).getTime());
  }, [assistantMode, groupSessions, listTab, sessions]);

  const found = useMemo(() => entries.filter((entry) => matches(entry.session, deferredQuery)), [deferredQuery, entries]);
  const visible = found.slice(0, shown);
  const folded = found.length - visible.length;

  function switchTab(tab: ChatListTab) {
    setMenuFor(null);
    setShown(PAGE_SIZE);
    setListTab(tab);
  }

  function editPinnedLine() {
    const next = window.prompt("置顶这句话:", pinnedLine);
    if (next !== null) updateSettings(assistantMode === "gpt" ? { gptChatPinnedLine: next.trim() } : { chatPinnedLine: next.trim() });
  }

  function rename(session: ChatSession) {
    setMenuFor(null);
    const next = window.prompt("给这封信换个名字:", session.name);
    if (next?.trim()) renameSession(session.id, next.trim());
  }

  function remove(session: ChatSession) {
    setMenuFor(null);
    if (window.confirm(`确定删除「${session.name}」吗？删除后无法恢复。`)) deleteSession(session.id);
  }

  function groupPreview(group: ChatSession) {
    const latest = getLatestSessionMessage(group);
    if (!latest) return `你、${claudeName}和${gptName}`;
    const speaker = latest.speaker === "gpt" ? gptName : latest.speaker === "claude" ? claudeName : "";
    return `${speaker ? `${speaker}：` : ""}${getSessionPreview(latest)}`;
  }

  function open(entry: Entry) {
    setMenuFor(null);
    if (entry.group) openGroup(entry.session.id);
    else openSession(assistantMode, entry.session.id);
  }

  const newLabel = listTab === "groups" ? "新建群聊" : "写一封新的信";

  return (
    <section className="lc-list" aria-label="聊天列表" onClick={() => { if (menuFor) setMenuFor(null); }}>
      <LetterPaperBloom className="letter-bloom-list" />
      <div className="lc-scroll">
        <div className="lc-sheet">
          <header className="lc-top">
            <button type="button" className="lc-back" onClick={onBack} aria-label="返回首页">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
              <span>iooi</span>
            </button>
            <button type="button" className="lc-write" onClick={listTab === "groups" ? createGroup : createSession} aria-label={newLabel} title={newLabel}>
              <span>write</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 16.5c2.6-.4 4.1-1.2 5.6-2.7l7.2-7.2a1.7 1.7 0 0 0-2.4-2.4L6.7 11.4c-1.5 1.5-2.3 3-2.7 5.6l-.5-.5" /><path d="M12.6 5.4l2 2" /></svg>
            </button>
          </header>

          <section className="lc-masthead">
            <LetterListVine className="lc-vine" />
            <h1 className="lc-title"><span>Our</span><span className="lc-title-turn">letters</span></h1>
            <button type="button" className="lc-pinned" onClick={editPinnedLine} title="点一下改写">
              {pinnedLine || "……"}
            </button>
            <p className="lc-state">
              <span className="lc-state-photo" aria-hidden="true">{settings.userAvatar ? <img src={settings.userAvatar} alt="" /> : null}</span>
              <span>{settings.userName || "宝宝"} · today, <em>{todayState || "想你"}</em></span>
            </p>
          </section>

          <nav className="lc-tabs" role="tablist" aria-label="聊天列表">
            {CHAT_LIST_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={listTab === item.id}
                className={listTab === item.id ? "lc-tab lc-tab-active" : "lc-tab"}
                onClick={() => switchTab(item.id)}
              >{TAB_COPY[item.id].label}</button>
            ))}
          </nav>

          {listTab !== "contacts" && (
            <label className="lc-search">
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.4 12.4 4.1 4.1" /></svg>
              <input
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setShown(PAGE_SIZE); }}
                placeholder={listTab === "groups" ? "想找哪一次围坐……" : "想找哪一封信……"}
                aria-label="搜索聊天"
                enterKeyHint="search"
              />
            </label>
          )}

          <section className="lc-letters" aria-label={copy.heading}>
            <div className="lc-letters-head">
              <h2>{copy.heading}<LetterPosy className="lc-head-posy" /></h2>
              {listTab !== "contacts" && found.length > 0 && <span>{visible.length} / {found.length}</span>}
            </div>

            {listTab === "contacts" ? (
              <div className="lc-rows" role="radiogroup" aria-label="收信人">
                {(["claude", "gpt"] as const).map((mode, index) => {
                  const selected = assistantMode === mode;
                  const own = mode === assistantMode ? sessions : contactSessions?.[mode] || [];
                  const latest = latestPrivateSession(own, mode);
                  return (
                    <div key={mode} className="lc-row">
                      <button type="button" role="radio" aria-checked={selected} className="lc-row-open"
                        onClick={() => updateSettings({ chatEntryStyle: mode === "gpt" ? "direct" : "list" })}>
                        <Photo src={personAvatar(mode)} tilt={index} />
                        <span className="lc-row-text">
                          <span className="lc-row-head"><b>{personName(mode)}</b>{selected && <i className="lc-chosen">此刻的收信人</i>}</span>
                          <span className="lc-row-preview">{selected ? "新的信，都会写给这一位。" : "轻点一下，换成写给这一位。"}</span>
                        </span>
                      </button>
                      {latest && (
                        <button type="button" className="lc-row-aside" onClick={() => openSession(mode, latest.id)}>最近的信</button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {found.length === 0 ? (
                  <p className="lc-empty">{deferredQuery ? "没有找到这样的信。" : listTab === "groups" ? "还没有围坐过。" : "还没有信，写下第一封吧。"}</p>
                ) : (
                  <div className="lc-rows">
                    {visible.map((entry, index) => {
                      const latest = getLatestSessionMessage(entry.session);
                      const name = entry.group ? entry.session.name || "一个群" : entry.session.name;
                      const own = !entry.group;
                      const work = own && assistantMode === "claude" ? sessionWorkProject(entry.session.messages) : undefined;
                      return (
                        <div key={entry.key} className="lc-row">
                          <button type="button" className="lc-row-open" onClick={() => open(entry)}>
                            {entry.group
                              ? <GroupPhotos avatars={[settings.aiAvatar, settings.gptAvatar, settings.userAvatar]} />
                              : <Photo src={personAvatar(assistantMode)} tilt={index} tag={work && CODE_PROJECT_LABELS[work]} />}
                            <span className="lc-row-text">
                              <span className="lc-row-head">
                                <b>{name}</b>
                                <time>{latest || entry.group ? letterListTime(getSessionStamp(entry.session)) : "未落笔"}</time>
                              </span>
                              <span className="lc-row-preview">{entry.group ? groupPreview(entry.session) : getSessionPreview(latest)}</span>
                            </span>
                          </button>
                          {own && (
                            <div className="lc-row-more" onClick={(event) => event.stopPropagation()}>
                              <button type="button" aria-label={`${name}的更多操作`} aria-expanded={menuFor === entry.key}
                                onClick={() => setMenuFor(menuFor === entry.key ? null : entry.key)}>
                                <svg viewBox="0 0 20 6" aria-hidden="true"><circle cx="3" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" /><circle cx="17" cy="3" r="1.3" /></svg>
                              </button>
                              {menuFor === entry.key && (
                                <div className="lc-row-menu" role="menu">
                                  <button type="button" role="menuitem" onClick={() => rename(entry.session)}>改个名字</button>
                                  <button type="button" role="menuitem" onClick={() => remove(entry.session)}>删掉这封</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {folded > 0 ? (
                  <button type="button" className="lc-unfold" onClick={() => setShown((count) => count + PAGE_SIZE)}>
                    <LetterFoldSprig className="lc-fold-sprig" />
                    <span className="lc-unfold-script">More letters to unfold…</span>
                    <span className="lc-unfold-line">还有 {folded} 封{listTab === "groups" ? "围坐的信" : "来信"}，轻轻收在这里</span>
                  </button>
                ) : shown > PAGE_SIZE && found.length > PAGE_SIZE ? (
                  <button type="button" className="lc-refold" onClick={() => setShown(PAGE_SIZE)}>
                    <LetterFoldSprig className="lc-fold-sprig" />
                    把它们重新折好
                  </button>
                ) : found.length > 0 && <LetterFoldSprig className="lc-fold-sprig lc-end-sprig" />}
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

/** An avatar tucked into the letter like a small photograph. */
function Photo({ src, tilt, tag }: { src: string; tilt: number; tag?: string }) {
  const photo = (
    <span className={`lc-photo lc-photo-tilt-${tilt % 3}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <i />}
    </span>
  );
  if (!tag) return photo;
  // A work window gets a small paper label pinned under its photo.
  return (
    <span className="lc-photo-wrap">
      {photo}
      <span className="lc-photo-tag" aria-label={`工作：${tag}`}>{tag}</span>
    </span>
  );
}

/** Three small photos fanned out for the round table. */
function GroupPhotos({ avatars }: { avatars: string[] }) {
  return (
    <span className="lc-photos" aria-hidden="true">
      {avatars.map((src, index) => (
        <span key={index} className={`lc-photo lc-photo-mini lc-photo-mini-${index + 1}`}>
          {src ? <img src={src} alt="" /> : <i />}
        </span>
      ))}
    </span>
  );
}
