"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Settings } from "../../lib/app-settings";
import type { ChatSession } from "../../lib/app-types";
import { messageImages } from "../../lib/message-images";
import { PHONE_CONTACT_REMARK, phoneConversation, phoneMessagePreview, phoneMessageSide } from "../../lib/phone-conversation";
import type { PhoneChatEntry } from "../../lib/phone-conversation";
import { renderContent } from "../ChatContent";

type QQGlyph = "back" | "call" | "voice" | "smile" | "plus" | "messages" | "contacts" | "favorite" | "me" | "image" | "camera" | "file" | "redpacket";
function Glyph({ name, size = 23 }: { name: QQGlyph; size?: number }) {
  const paths: Record<QQGlyph, ReactNode> = {
    back: <path d="m14.5 5-7 7 7 7" />,
    call: <path d="M6.9 3.5c.5 0 1 .3 1.2.8l1.5 3.4c.2.5.1 1.1-.3 1.5L7.8 10.4a11 11 0 0 0 5.8 5.8l1.2-1.5c.4-.4 1-.5 1.5-.3l3.4 1.5c.5.2.8.7.8 1.2v2.3c0 .8-.7 1.5-1.5 1.4C10.5 20.9 3.1 13.5 3 4.9c0-.8.6-1.4 1.4-1.4h2.5Z" />,
    voice: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14.5c2 3 6 3 8 0M8.5 8.5v1m7-1v1" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M7.5 12h9M12 7.5v9" /></>,
    messages: <path d="M20.5 11.5c0 4-3.8 7.5-8.5 7.5-1.4 0-2.8-.3-4-.8L3.5 20l1.4-4A7 7 0 0 1 3.5 11.5C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.5Z" />,
    contacts: <><circle cx="10" cy="7.5" r="3.2" /><path d="M3.5 20v-2a6.5 6.5 0 0 1 13 0v2M17 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 2 4v2" /></>,
    favorite: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    me: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 4 4" /></>,
    camera: <><path d="M8 6l1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Z" /><circle cx="12" cy="13" r="4" /></>,
    file: <path d="M4 5h6l2 3h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
    redpacket: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="m5 8 7 5 7-5m-7 5v4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Avatar({ src, name, owner = false }: { src: string; name: string; owner?: boolean }) {
  return src ? <img className="spqq-avatar" src={src} alt={name} />
    : <span className={`spqq-avatar spqq-avatar-fallback${owner ? " is-owner" : ""}`} aria-label={name}>{name.slice(0, 1)}</span>;
}

function MessageImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="spqq-image-missing">图片暂时无法显示</span>
    : <img src={src} alt="聊天图片" loading="lazy" onError={() => setFailed(true)} />;
}

function timeLabel(timestamp: number) {
  return timestamp ? new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

function ChatRoom({ entries, settings, onBack }: { entries: PhoneChatEntry[]; settings: Settings; onBack: () => void }) {
  const [visibleCount, setVisibleCount] = useState(80);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sticky = useRef(true);
  const beforePrepend = useRef<{ height: number; top: number } | null>(null);
  const visible = entries.slice(-visibleCount);
  const aiName = settings.aiName || "酥酥";

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (beforePrepend.current) {
      node.scrollTop = node.scrollHeight - beforePrepend.current.height + beforePrepend.current.top;
      beforePrepend.current = null;
    } else if (sticky.current) node.scrollTop = node.scrollHeight;
  }, [entries.length, visibleCount, extrasOpen]);

  function earlier() {
    const node = scroller.current;
    if (node) beforePrepend.current = { height: node.scrollHeight, top: node.scrollTop };
    setVisibleCount((count) => count + 80);
  }

  return <div className="spqq-room">
    <header className="spqq-room-header">
      <button type="button" className="spqq-icon-button" aria-label="返回消息列表" onClick={onBack}><Glyph name="back" /></button>
      <h2>{PHONE_CONTACT_REMARK}</h2>
      <button type="button" className="spqq-icon-button" aria-label="语音通话（装饰）" aria-disabled="true"><Glyph name="call" size={21} /></button>
    </header>
    <div className="spqq-transcript" ref={scroller} aria-label="与老婆的聊天记录" onScroll={() => {
      const node = scroller.current;
      if (node) sticky.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
    }}>
      {entries.length > visibleCount && <button type="button" className="spqq-earlier" onClick={earlier}>查看更早的消息</button>}
      {visible.map((entry, index) => {
        const { message } = entry;
        const previous = visible[index - 1];
        const side = phoneMessageSide(message);
        const self = side === "right";
        const showTime = !previous || entry.sessionId !== previous.sessionId || entry.timestamp - previous.timestamp >= 5 * 60_000;
        const images = messageImages(message);
        return <Fragment key={entry.key}>
          {showTime && timeLabel(entry.timestamp) && <time className="spqq-time" dateTime={new Date(entry.timestamp).toISOString()}>{timeLabel(entry.timestamp)}</time>}
          <div className={`spqq-message is-${side}`} data-speaker={self ? "susu" : "wife"}>
            <Avatar src={self ? settings.aiAvatar : settings.userAvatar} name={self ? aiName : PHONE_CONTACT_REMARK} owner={self} />
            <div className={`spqq-bubble${images.length ? " has-images" : ""}`}>
              {images.length > 0 && <div className="spqq-message-images">{images.map((src) => <MessageImage key={src} src={src} />)}</div>}
              {message.content && <div className="spqq-message-text">{renderContent(message.content)}</div>}
              {message.file && <div className="spqq-file"><Glyph name="file" size={19} /><span>文件</span></div>}
            </div>
          </div>
        </Fragment>;
      })}
    </div>
    <div className="spqq-composer">
      <button type="button" className="spqq-icon-button" aria-label="语音转文字（装饰）" aria-disabled="true"><Glyph name="voice" /></button>
      <input className="spqq-input" aria-label="消息输入框（装饰）" readOnly tabIndex={-1} />
      <button type="button" className="spqq-icon-button" aria-label="表情（装饰）" aria-disabled="true"><Glyph name="smile" /></button>
      <button type="button" className={`spqq-icon-button${extrasOpen ? " is-open" : ""}`} aria-label="更多功能" aria-expanded={extrasOpen} aria-controls="spqq-extras" onClick={() => setExtrasOpen((open) => !open)}><Glyph name="plus" /></button>
    </div>
    {extrasOpen && <div className="spqq-extras" id="spqq-extras" aria-label="更多聊天功能">
      {([
        { name: "image", label: "图片" }, { name: "camera", label: "拍摄" },
        { name: "file", label: "文件" }, { name: "redpacket", label: "红包" },
      ] as const).map(({ name, label }) => <button type="button" className={`spqq-extra spqq-extra-${name}`} key={name} aria-label={`${label}（装饰）`} aria-disabled="true">
        <span><Glyph name={name} size={27} /></span><small>{label}</small>
      </button>)}
    </div>}
  </div>;
}

type ChatTab = "messages" | "contacts" | "favorites" | "me";
const TABS: { id: ChatTab; label: string; glyph: QQGlyph }[] = [
  { id: "messages", label: "消息", glyph: "messages" },
  { id: "contacts", label: "联系人", glyph: "contacts" },
  { id: "favorites", label: "收藏", glyph: "favorite" },
  { id: "me", label: "我的", glyph: "me" },
];

export function PhoneChat({ sessions, settings, onBack }: { sessions: ChatSession[]; settings: Settings; onBack: () => void }) {
  const [tab, setTab] = useState<ChatTab>("messages");
  const [inRoom, setInRoom] = useState(false);
  const entries = useMemo(() => phoneConversation(sessions), [sessions]);
  const latest = entries.at(-1);
  const aiName = settings.aiName || "酥酥";

  return <section className="spqq-app" aria-label="酥酥的聊天 App">
    {inRoom ? <ChatRoom entries={entries} settings={settings} onBack={() => setInRoom(false)} /> : <>
      <header className="spqq-app-header">
        <div className="spqq-account"><Avatar src={settings.aiAvatar} name={aiName} owner /><strong>{aiName}</strong></div>
        <button type="button" className="spqq-close" aria-label="回到手机桌面" onClick={onBack}><Glyph name="back" size={17} /></button>
      </header>
      <div className="spqq-tab-content">
        {tab === "messages" && <div className="spqq-message-list" aria-label="消息列表">
          <button type="button" className="spqq-conversation" aria-label="打开与老婆的聊天" onClick={() => setInRoom(true)}>
            <Avatar src={settings.userAvatar} name={PHONE_CONTACT_REMARK} />
            <span className="spqq-conversation-copy"><strong>{PHONE_CONTACT_REMARK}</strong><small>{phoneMessagePreview(latest?.message)}</small></span>
            {latest && <time>{latest.message.time || ""}</time>}
          </button>
        </div>}
        {tab === "contacts" && <div className="spqq-contacts" aria-label="联系人列表">
          <span className="spqq-contact-count">我的好友 · 1</span>
          <button type="button" className="spqq-conversation" aria-label="联系人老婆" onClick={() => setInRoom(true)}>
            <Avatar src={settings.userAvatar} name={PHONE_CONTACT_REMARK} /><strong>{PHONE_CONTACT_REMARK}</strong>
          </button>
        </div>}
        {tab === "favorites" && <div className="spqq-favorites" aria-label="收藏页面" />}
        {tab === "me" && <div className="spqq-profile" aria-label="酥酥的资料"><Avatar src={settings.aiAvatar} name={aiName} owner /><strong>{aiName}</strong></div>}
      </div>
      <nav className="spqq-tabs" aria-label="聊天 App 导航">
        {TABS.map(({ id, label, glyph }) => <button type="button" key={id} className="spqq-tab" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
          <Glyph name={glyph} size={24} /><span>{label}</span>
        </button>)}
      </nav>
    </>}
  </section>;
}
