"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import NextImage from "next/image";
import { PageBack } from "./PageBack";
import { IconLineBook } from "./NavIcons";
import type { Settings } from "../lib/app-settings";
import { createReadingDemo, parseReadingText, readingProgress, MAX_READING_BYTES } from "../lib/reading-books";
import type { ReadingAnnotation, ReadingBook, ReadingCompanion } from "../lib/reading-books";
import { loadReadingLibrary, saveReadingBook } from "../lib/reading-library";

function CompanionAvatar({ settings, companion }: { settings: Settings; companion: ReadingCompanion }) {
  const image = companion === "claude" ? settings.aiAvatar : settings.gptAvatar;
  const name = companionName(settings, companion);
  return <span className="reading-avatar">{image
    ? <NextImage src={image} width={28} height={28} alt="" unoptimized />
    : <span>{name.slice(0, 1)}</span>}</span>;
}

function companionName(settings: Settings, companion: ReadingCompanion) {
  return companion === "claude" ? settings.aiName || "酥酥" : settings.gptName || "郁郁";
}

function ReadingDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog className="reading-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="reading-dialog-inner">
      <div className="reading-section-head"><h2 id={titleId}>{title}</h2>
        <button type="button" className="reading-icon-button" onClick={onClose} aria-label="关闭">×</button>
      </div>
      {children}
    </div>
  </dialog>;
}

function CompanionPicker({ settings, value, onChange }: { settings: Settings; value: ReadingCompanion; onChange: (value: ReadingCompanion) => void }) {
  return <div className="reading-companions" role="group" aria-label="陪读的人">
    {(["claude", "gpt"] as const).map((companion) => <button type="button" key={companion}
      className={`reading-companion${value === companion ? " is-selected" : ""}`}
      aria-pressed={value === companion} onClick={() => onChange(companion)}>
      <CompanionAvatar settings={settings} companion={companion} />
      <span>{companionName(settings, companion)}</span>
      {value === companion && <span className="reading-selected-mark" aria-hidden="true">✓</span>}
    </button>)}
  </div>;
}

function BookCover({ book, large = false }: { book: ReadingBook; large?: boolean }) {
  return <span className={`reading-cover${large ? " reading-cover-large" : ""}`} aria-hidden="true">
    <IconLineBook size={large ? 30 : 22} />
    <span>{book.title}</span><small>{book.isDemo ? "书房示例" : "iooi reading"}</small>
  </span>;
}

function ReadingReader({ book, settings, onPosition, onBack }: {
  book: ReadingBook; settings: Settings;
  onPosition: (chapterId: string, paragraphIndex: number) => void;
  onBack: () => void;
}) {
  const [chapterId, setChapterId] = useState(() => book.chapters.some((chapter) => chapter.id === book.position.chapterId)
    ? book.position.chapterId : book.chapters[0].id);
  const [fontSize, setFontSize] = useState(18);
  const [tocOpen, setTocOpen] = useState(false);
  const [annotation, setAnnotation] = useState<ReadingAnnotation | "empty" | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const positionCallback = useRef(onPosition);
  const resumePosition = useRef(book.position);
  const chapterIndex = book.chapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = book.chapters[chapterIndex];
  const name = companionName(settings, book.companion);

  useEffect(() => { positionCallback.current = onPosition; }, [onPosition]);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.paragraph);
        if (entry.isIntersecting) visible.add(index); else visible.delete(index);
      }
      if (visible.size) positionCallback.current(chapterId, Math.min(...visible));
    }, { root: scroll, threshold: 0 });
    const frame = requestAnimationFrame(() => {
      const position = resumePosition.current;
      const index = position.chapterId === chapterId ? position.paragraphIndex : 0;
      const target = scroll.querySelector<HTMLElement>(`[data-paragraph="${index}"]`);
      scroll.scrollTop = index > 0 && target ? Math.max(0, target.offsetTop - 16) : 0;
      scroll.querySelectorAll("[data-paragraph]").forEach((paragraph) => observer.observe(paragraph));
    });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [book.id, chapterId]);

  function openChapter(id: string) {
    resumePosition.current = { chapterId: id, paragraphIndex: 0 };
    setChapterId(id);
    positionCallback.current(id, 0);
    setTocOpen(false);
  }

  function changeFontSize() {
    const scroll = scrollRef.current;
    const top = scroll?.getBoundingClientRect().top ?? 0;
    const anchor = scroll ? Array.from(scroll.querySelectorAll<HTMLElement>("[data-paragraph]"))
      .find((paragraph) => paragraph.getBoundingClientRect().bottom > top + 1) : undefined;
    const offset = scroll && anchor ? scroll.scrollTop - anchor.offsetTop : 0;
    setFontSize((size) => size >= 22 ? 16 : size + 2);
    requestAnimationFrame(() => {
      if (scroll?.isConnected && anchor) scroll.scrollTop = Math.max(0, anchor.offsetTop + offset);
    });
  }

  return <>
    <header className="reading-reader-head">
      <button type="button" className="reading-text-button" onClick={onBack}>书架</button>
      <div><strong>{book.title}</strong><span>{book.isDemo ? "示例正文与示例批注" : `${name}陪你读`}</span></div>
      <button type="button" className="reading-icon-button" aria-label={`调整字号，当前 ${fontSize}`} onClick={changeFontSize}>Aa</button>
    </header>
    <div className="reading-reader-tools">
      <button type="button" className="reading-text-button" onClick={() => setTocOpen(true)}>目录 · {chapterIndex + 1}/{book.chapters.length}</button>
      <button type="button" className="reading-notes-button" onClick={() => setAnnotation("empty")}>
        <CompanionAvatar settings={settings} companion={book.companion} />
        {book.isDemo ? "示例批注" : "他的批注"}
      </button>
    </div>
    <article ref={scrollRef} className="reading-text" style={{ fontSize }} aria-label="书籍正文">
      <h1>{chapter.title}</h1>
      {chapter.paragraphs.map((paragraph, index) => {
        const note = book.annotations.find((item) => item.chapterId === chapter.id && item.paragraphIndex === index && paragraph.includes(item.quote));
        return <div className={`reading-paragraph${note ? " has-annotation" : ""}`} key={`${chapter.id}-${index}`} data-paragraph={index}>
          <p>{paragraph}</p>
          {note && <button type="button" className="reading-annotation-mark" onClick={() => setAnnotation(note)} aria-label={`查看${name}对这段的${book.isDemo ? "示例" : ""}批注`}>
            <CompanionAvatar settings={settings} companion={book.companion} />
          </button>}
        </div>;
      })}
      <p className="reading-chapter-end">{chapterIndex === book.chapters.length - 1 ? "这一册，到这里读完了。" : "这一章，到这里。"}</p>
    </article>
    <footer className="reading-reader-footer">
      <button type="button" className="reading-text-button" disabled={chapterIndex === 0} onClick={() => openChapter(book.chapters[chapterIndex - 1].id)}>上一章</button>
      <span>{readingProgress(book)}%</span>
      <button type="button" className="reading-text-button" disabled={chapterIndex === book.chapters.length - 1} onClick={() => openChapter(book.chapters[chapterIndex + 1].id)}>下一章</button>
    </footer>
    {tocOpen && <ReadingDialog title="目录" onClose={() => setTocOpen(false)}>
      <div className="reading-toc">{book.chapters.map((item, index) => <button type="button" key={item.id}
        aria-current={item.id === chapterId ? "location" : undefined} onClick={() => openChapter(item.id)}>
        <span>{String(index + 1).padStart(2, "0")}</span>{item.title}
      </button>)}</div>
    </ReadingDialog>}
    {annotation && <ReadingDialog title={book.isDemo ? "示例批注" : `${name}留下的话`} onClose={() => setAnnotation(null)}>
      {annotation === "empty" ? <div className="reading-note-empty">
        <CompanionAvatar settings={settings} companion={book.companion} />
        <p>{book.isDemo ? "正文旁的小头像，就是批注入口。" : "他还没有留下批注。"}</p>
        <span>{book.isDemo ? "示例只展示布局，批注并非一次真实的 AI 预读。" : "AI 预读尚未开放。你的书和阅读进度会先保存好。"}</span>
      </div> : <div className="reading-note">
        <div className="reading-note-person"><CompanionAvatar settings={settings} companion={book.companion} /><span>{name}{book.isDemo ? " · 布局示例" : ""}</span></div>
        <blockquote>{annotation.quote}</blockquote><p>{annotation.content}</p>
      </div>}
    </ReadingDialog>}
  </>;
}

export function ReadingView({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState<ReadingBook | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestProgress = useRef<ReadingBook | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const book = books.find((item) => item.id === selectedId);

  useEffect(() => {
    let disposed = false;
    loadReadingLibrary().then((items) => { if (!disposed) setBooks(items); })
      .catch((error: Error) => { if (!disposed) setNotice(error.message); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    function flush() {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestProgress.current) void saveReadingBook(latestProgress.current).catch((error: Error) => setNotice(error.message));
    }
    function hidden() { if (document.visibilityState === "hidden") flush(); }
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); flush(); };
  }, []);

  async function persist(next: ReadingBook): Promise<boolean> {
    try {
      await saveReadingBook(next);
      setBooks((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setNotice("");
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败，请稍后重试。"); return false; }
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (!/\.txt$/i.test(file.name)) { setNotice("这一版先支持 TXT，EPUB 阅读会随后接入。"); return; }
    if (file.size > MAX_READING_BYTES) { setNotice("TXT 暂时最多支持 10MB。"); return; }
    setBusy(true);
    try {
      const chapters = parseReadingText(new Uint8Array(await file.arrayBuffer()));
      setDraft({ id: crypto.randomUUID(), title: file.name.replace(/\.txt$/i, "").trim() || "未命名的书",
        companion: "claude", chapters, annotations: [], position: { chapterId: chapters[0].id, paragraphIndex: 0 },
        preRead: { status: "not-started", completedChapters: 0 }, createdAt: Date.now(), lastReadAt: 0, isDemo: false });
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "没能读出这本书，请重试。"); }
    finally { setBusy(false); }
  }

  function recordPosition(chapterId: string, paragraphIndex: number) {
    if (!book) return;
    if (book.lastReadAt && book.position.chapterId === chapterId && book.position.paragraphIndex === paragraphIndex) return;
    const next = { ...book, position: { chapterId, paragraphIndex }, lastReadAt: Date.now() };
    latestProgress.current = next;
    setBooks((items) => items.map((item) => item.id === next.id ? next : item));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveReadingBook(next).catch((error: Error) => setNotice(error.message)); }, 500);
  }

  async function leaveReader() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (latestProgress.current && !(await persist(latestProgress.current))) return;
    latestProgress.current = null;
    setReading(false);
    setSelectedId(null);
  }

  async function openDemo() {
    const demo = books.find((item) => item.id === "reading-demo-claude") || createReadingDemo("claude");
    if (await persist(demo)) setSelectedId(demo.id);
  }

  return <>
    <section key={book ? `${reading ? "reader" : "book"}-${book.id}` : "shelf"}
      className={`diary-body reading-body reading-room${book && reading ? " reading-reader" : ""}`}>
      {notice && !draft && <div className="reading-notice" role="alert"><span>{notice}</span>
        <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
      {book && reading ? <ReadingReader book={book} settings={settings} onPosition={recordPosition} onBack={() => { void leaveReader(); }} />
        : book ? <>
          <button type="button" className="reading-text-button reading-back-link" onClick={() => setSelectedId(null)}>‹ 回到书架</button>
          <div className="reading-book-hero"><BookCover book={book} large />
            <h1>{book.title}</h1><p>{book.isDemo ? "书房示例" : "TXT"} · {book.chapters.length} 章</p></div>
          <div className="reading-card"><h2>陪你读的人</h2>
            <CompanionPicker settings={settings} value={book.companion} onChange={(companion) => { void persist({ ...book, companion }); }} />
          </div>
          <div className="reading-card reading-pre-read">
            <div className="reading-section-head"><h2>{book.isDemo ? "批注布局示例" : "等他留下批注"}</h2>
              <span className="reading-badge">{book.isDemo ? "示例" : "尚未开放"}</span></div>
            <p>{book.isDemo ? "这本短书和批注用于展示阅读布局，并非真实的 AI 预读结果。" : "AI 预读与批注正在准备。你可以先保存书、阅读正文，之后再看他留下的话。"}</p>
            <progress max={book.chapters.length} value={book.preRead.completedChapters} aria-label={book.isDemo ? "示例预读进度" : "AI 预读进度"} />
            <span className="reading-small">{book.isDemo ? "2 章 · 2 条示例批注" : `预读 ${book.preRead.completedChapters}/${book.chapters.length} 章`}</span>
          </div>
          <button type="button" className="reading-primary" onClick={() => setReading(true)}>{book.lastReadAt ? "继续阅读" : "开始阅读"}</button>
          <p className="reading-local-note">正文与进度保存在这台设备。暂不跨设备同步。</p>
        </> : <>
          <header className="reading-shelf-head"><div><span className="reading-eyebrow">reading</span><h1>我们的书房</h1></div>
            <button type="button" className="reading-add" disabled={busy || loading} onClick={() => inputRef.current?.click()} aria-label="导入书籍">＋</button></header>
          <p className="reading-intro">他先读，留下想对你说的话。你慢慢看。</p>
          {loading ? <p className="reading-local-note" role="status">正在打开书架…</p> : books.length ? <div className="reading-shelf">
            {books.map((item) => <button type="button" key={item.id} className="reading-book-card" onClick={() => setSelectedId(item.id)}>
              <BookCover book={item} /><span className="reading-book-info"><strong>{item.title}</strong>
                <span className="reading-small">{item.isDemo ? "示例" : "TXT"} · {item.chapters.length} 章</span>
                <span className="reading-book-person"><CompanionAvatar settings={settings} companion={item.companion} />{companionName(settings, item.companion)}陪你读</span>
                <span className="reading-small">{item.lastReadAt ? `读到 ${readingProgress(item)}%` : item.isDemo ? "看看批注会出现在哪里" : "已加入书架 · 等待陪读"}</span>
              </span><span className="reading-card-arrow" aria-hidden="true">›</span>
            </button>)}
          </div> : <div className="reading-card reading-empty-state"><IconLineBook size={40} /><h2>把一本书留在这里</h2>
            <p>先导入一本 TXT，选一个陪你读的人。</p>
            <button type="button" className="reading-primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "正在打开…" : "导入第一本书"}</button>
          </div>}
          {!loading && <button type="button" className="reading-demo-link" onClick={() => { void openDemo(); }}>看看书房示例 ↗</button>}
          <p className="reading-local-note">支持 TXT，最多 10MB。书籍保存在这台设备。</p>
        </>}
      <input type="file" accept=".txt,text/plain" hidden ref={inputRef} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ""; void importFile(file);
      }} />
    </section>
    <PageBack onBack={book && reading ? () => { void leaveReader(); } : book ? () => setSelectedId(null) : onBack}
      label={book ? "返回书架" : "返回桌面"} />
    {draft && <ReadingDialog title="放进我们的书房" onClose={() => setDraft(null)}>
      {notice && <p className="reading-notice" role="alert">{notice}</p>}
      <label className="reading-input-label">书名<input className="reading-title-input" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <p className="reading-small">选一个陪你读的人</p>
      <CompanionPicker settings={settings} value={draft.companion} onChange={(companion) => setDraft({ ...draft, companion })} />
      <p className="reading-local-note">正文已识别，共 {draft.chapters.length} 章。AI 预读尚未开放。</p>
      <button type="button" className="reading-primary" disabled={busy || !draft.title.trim()} onClick={async () => {
        setBusy(true);
        if (await persist({ ...draft, title: draft.title.trim() })) { setSelectedId(draft.id); setDraft(null); }
        setBusy(false);
      }}>{busy ? "正在保存…" : "加入书架"}</button>
    </ReadingDialog>}
  </>;
}
