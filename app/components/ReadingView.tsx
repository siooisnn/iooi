"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BookGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import { CLAUDE_DEFAULT_NAME, type Settings } from "../lib/app-settings";
import { apiFetch } from "../lib/client-api";
import {
  MAX_READING_BYTES, READING_SHELVES, SHELF_LABEL, paceLine, percentAt,
  type ReadingChapter, type ReadingMark, type ReadingNote, type ReadingShelf, type ReadingWho, type ShelfBook,
} from "../lib/reading-books";
import { LEGACY_MOVED_KEY, loadLegacyBooks } from "../lib/reading-library";

type Reply = { ok: boolean; error?: string; book?: ShelfBook; books?: ShelfBook[]; chapters?: ReadingChapter[] | null };

async function readingApi(init: RequestInit & { query?: string } = {}): Promise<Reply> {
  const { query, ...rest } = init;
  let response: Response;
  try {
    response = await apiFetch(`/api/reading${query ? `?${query}` : ""}`, rest);
  } catch {
    throw new Error("连不上书房，看看网络再试。");
  }
  const data = await response.json().catch(() => null) as Reply | null;
  if (!response.ok || !data?.ok) throw new Error(data?.error || "书房出了点问题，请稍后再试。");
  return data;
}

function postReading(body: Record<string, unknown>) {
  return readingApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function putReadingText(file: File, params: Record<string, string>) {
  return readingApi({ method: "PUT", query: new URLSearchParams(params).toString(),
    headers: { "Content-Type": "application/octet-stream" }, body: file });
}

function checkTxt(file: File) {
  if (!/\.txt$/i.test(file.name)) throw new Error("这一版先支持 TXT。");
  if (file.size > MAX_READING_BYTES) throw new Error("TXT 暂时最多支持 10MB。");
}

const COVER_COLORS = ["#c0392b", "#2e6bc6", "#2f8f4e", "#8e44ad", "#d35400", "#16a085", "#b03a73", "#7f6a3a"];
function coverColor(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_COLORS[hash % COVER_COLORS.length];
}

function Cover({ title, large = false }: { title: string; large?: boolean }) {
  return <span className={`rd-cover${large ? " rd-cover-large" : ""}`} style={{ "--rd-cover": coverColor(title) } as CSSProperties} aria-hidden="true">
    <span>{title}</span>
  </span>;
}

/** An XP progress bar: pink blocks for her, blue for him. */
function Progress({ who, label, mark }: { who: ReadingWho; label: string; mark: ReadingMark | null }) {
  const percent = mark?.percent ?? 0;
  return <div className={`rd-progress rd-progress-${who}`}>
    <span className="rd-progress-name">{label}</span>
    <span className="rd-progress-bar" role="progressbar" aria-label={`${label}的进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <i style={{ width: `${percent}%` }} />
    </span>
    <span className="rd-progress-value">{mark ? `${percent}%` : "未开始"}</span>
  </div>;
}

type BookForm = { title: string; author: string; shelf: ReadingShelf; wantedBy: ReadingWho; blurb: string; file: File | null };

function BookFormDialog({ initial, hisName, isNew, onClose, onSubmit }: {
  initial: BookForm; hisName: string; isNew: boolean;
  onClose: () => void; onSubmit: (form: BookForm) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BookForm>) => setForm((current) => ({ ...current, ...patch }));
  return <XpDialog title={isNew ? "添加一本书" : "书的属性"} onClose={onClose}>
    <form className="rd-form" onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !form.title.trim()) return;
      setBusy(true); setError("");
      try { await onSubmit(form); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "没能保存，请再试一次。"); setBusy(false); }
    }}>
      <label><span>书名</span><input value={form.title} maxLength={120} required onChange={(event) => set({ title: event.target.value })} /></label>
      <label><span>作者</span><input value={form.author} maxLength={80} placeholder="可以不填" onChange={(event) => set({ author: event.target.value })} /></label>
      <fieldset className="rd-radio-row"><legend>放在</legend>
        {READING_SHELVES.map((shelf) => <label key={shelf}><input type="radio" name="rd-shelf" checked={form.shelf === shelf} onChange={() => set({ shelf })} />{SHELF_LABEL[shelf]}</label>)}
      </fieldset>
      {form.shelf === "want" && <fieldset className="rd-radio-row"><legend>谁想读</legend>
        <label><input type="radio" name="rd-who" checked={form.wantedBy === "her"} onChange={() => set({ wantedBy: "her" })} />你</label>
        <label><input type="radio" name="rd-who" checked={form.wantedBy === "him"} onChange={() => set({ wantedBy: "him" })} />{hisName}</label>
      </fieldset>}
      <label><span>一句话</span><input value={form.blurb} maxLength={200} placeholder="为什么想读，或者随便写点" onChange={(event) => set({ blurb: event.target.value })} /></label>
      {isNew && <div className="rd-file-row"><span>正文</span>
        <button type="button" className="rd-button" onClick={() => fileRef.current?.click()}>选择 TXT…</button>
        <small>{form.file ? form.file.name : "可以先不放，之后再导入"}</small>
        <input type="file" accept=".txt,text/plain" hidden ref={fileRef} onChange={(event) => {
          const file = event.target.files?.[0] || null; event.target.value = "";
          if (!file) return;
          try { checkTxt(file); setError(""); set({ file, title: form.title || file.name.replace(/\.txt$/i, "").trim() }); }
          catch (failure) { setError((failure as Error).message); }
        }} />
      </div>}
      {error && <p className="rd-error" role="alert">{error}</p>}
      <div className="rd-dialog-buttons">
        <button type="submit" className="rd-button rd-button-default" disabled={busy || !form.title.trim()}>{busy ? "正在保存…" : "确定"}</button>
        <button type="button" className="rd-button" onClick={onClose}>取消</button>
      </div>
    </form>
  </XpDialog>;
}

function bookForm(book?: ShelfBook, shelf: ReadingShelf = "reading"): BookForm {
  return { title: book?.title || "", author: book?.author || "", shelf: book?.shelf || shelf,
    wantedBy: book?.wantedBy || "her", blurb: book?.blurb || "", file: null };
}

function ShelfList({ books, shelf, hisName, onOpen }: { books: ShelfBook[]; shelf: ReadingShelf; hisName: string; onOpen: (id: string) => void }) {
  const items = books.filter((book) => book.shelf === shelf);
  if (!items.length) return <div className="rd-empty">
    <BookGlyph />
    <p>{shelf === "reading" ? "还没有在读的书。" : shelf === "want" ? "想读什么，先记在这里。" : "读完的书会放在这里。"}</p>
    <small>{shelf === "reading" ? "点上面的「添加」，记个书名，或者导入一本 TXT。" : shelf === "want" ? "你想读的，他想读的，都可以放。" : "读完了就把书挪过来。"}</small>
  </div>;
  return <ul className="rd-list">
    {items.map((book) => <li key={book.id}>
      <button type="button" className="rd-row" onClick={() => onOpen(book.id)}>
        <Cover title={book.title} />
        <span className="rd-row-main">
          <strong>{book.title}</strong>
          {book.author && <span className="rd-row-author">{book.author}</span>}
          {shelf === "want" ? <>
            {book.wantedBy && <span className="rd-tag">{book.wantedBy === "her" ? "你想读" : `${hisName}想读`}</span>}
            {book.blurb && <span className="rd-row-blurb">{book.blurb}</span>}
          </> : <>
            <Progress who="her" label="你" mark={book.her} />
            <Progress who="him" label={hisName} mark={book.him} />
          </>}
        </span>
      </button>
    </li>)}
  </ul>;
}

function BookPage({ book, hisName, onRead, onEdit, onDelete, onMark, onText, busy }: {
  book: ShelfBook; hisName: string; busy: boolean;
  onRead: () => void; onEdit: () => void; onDelete: () => void;
  onMark: (percent: number) => void; onText: (file: File) => void;
}) {
  const [percent, setPercent] = useState(book.her?.percent ?? 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const notes = [...book.notes].sort((a, b) => b.at - a.at);
  return <div className="rd-book">
    <section className="rd-book-head">
      <Cover title={book.title} large />
      <div>
        <h2>{book.title}</h2>
        {book.author && <p>{book.author}</p>}
        <p className="rd-muted">{SHELF_LABEL[book.shelf]}{book.hasText ? ` · TXT · ${book.chapterCount} 章` : " · 没有正文"}</p>
        {book.shelf === "want" && book.wantedBy && <span className="rd-tag">{book.wantedBy === "her" ? "你想读" : `${hisName}想读`}</span>}
        {book.blurb && <p className="rd-blurb">{book.blurb}</p>}
      </div>
    </section>

    <fieldset className="rd-group"><legend>我们读到哪了</legend>
      <Progress who="her" label="你" mark={book.her} />
      <Progress who="him" label={hisName} mark={book.him} />
      <p className="rd-pace">{paceLine(book, hisName)}</p>
      {!book.hasText && <form className="rd-manual" onSubmit={(event) => { event.preventDefault(); onMark(percent); }}>
        <label htmlFor={`rd-manual-${book.id}`}>纸质书或者在别处读的，自己拖一下：</label>
        <div>
          <input id={`rd-manual-${book.id}`} type="range" min={0} max={100} value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
          <output>{percent}%</output>
          <button type="submit" className="rd-button" disabled={busy || percent === (book.her?.percent ?? -1)}>记下</button>
        </div>
      </form>}
    </fieldset>

    <fieldset className="rd-group"><legend>{hisName}的批注{notes.length ? ` (${notes.length})` : ""}</legend>
      {notes.length ? <ul className="rd-notes">{notes.map((note) => <li key={note.id}>
        {note.quote && <blockquote>{note.quote}</blockquote>}<p>{note.content}</p>
      </li>)}</ul> : <p className="rd-muted">他还没留下批注。读到想跟你说的地方，他会写在这里。</p>}
    </fieldset>

    <div className="rd-book-actions">
      {book.hasText
        ? <button type="button" className="rd-button rd-button-default" onClick={onRead}>{book.her ? "继续阅读" : "开始阅读"}</button>
        : <button type="button" className="rd-button rd-button-default" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "正在导入…" : "导入正文 TXT"}</button>}
      <button type="button" className="rd-button" onClick={onEdit}>属性…</button>
      {book.hasText && <button type="button" className="rd-button" disabled={busy} onClick={() => fileRef.current?.click()}>换正文</button>}
      <button type="button" className="rd-button" disabled={busy} onClick={onDelete}>删除</button>
      <input type="file" accept=".txt,text/plain" hidden ref={fileRef} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) onText(file);
      }} />
    </div>
  </div>;
}

function Reader({ book, chapters, hisName, onPosition, onClose }: {
  book: ShelfBook; chapters: ReadingChapter[]; hisName: string;
  onPosition: (chapterId: string, paragraphIndex: number) => void;
  onClose: () => void;
}) {
  const start = book.her?.chapterId && chapters.some((chapter) => chapter.id === book.her?.chapterId) ? book.her : null;
  const [chapterId, setChapterId] = useState(start?.chapterId || chapters[0].id);
  const [fontSize, setFontSize] = useState(17);
  const [tocOpen, setTocOpen] = useState(false);
  const [note, setNote] = useState<ReadingNote | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const positionCallback = useRef(onPosition);
  const resume = useRef({ chapterId: start?.chapterId || chapters[0].id, paragraphIndex: start?.paragraphIndex || 0 });
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = chapters[chapterIndex];
  const hisSpot = book.him?.chapterId === chapterId ? book.him.paragraphIndex ?? -1 : -1;
  const [herSpot, setHerSpot] = useState(book.her?.percent ?? 0);

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
      if (!visible.size) return;
      const index = Math.min(...visible);
      positionCallback.current(chapterId, index);
      setHerSpot(percentAt(chapters, chapterId, index));
    }, { root: scroll, threshold: 0 });
    const frame = requestAnimationFrame(() => {
      const position = resume.current;
      const index = position.chapterId === chapterId ? position.paragraphIndex : 0;
      const target = scroll.querySelector<HTMLElement>(`[data-paragraph="${index}"]`);
      scroll.scrollTop = index > 0 && target ? Math.max(0, target.offsetTop - 12) : 0;
      scroll.querySelectorAll("[data-paragraph]").forEach((paragraph) => observer.observe(paragraph));
    });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [chapters, chapterId]);

  function openChapter(id: string) {
    resume.current = { chapterId: id, paragraphIndex: 0 };
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
    setFontSize((size) => size >= 21 ? 15 : size + 2);
    requestAnimationFrame(() => {
      if (scroll?.isConnected && anchor) scroll.scrollTop = Math.max(0, anchor.offsetTop + offset);
    });
  }

  return <div className="rd-reader">
    <div className="rd-toolbar">
      <button type="button" className="rd-tool" onClick={onClose}>‹ 返回</button>
      <button type="button" className="rd-tool" onClick={() => setTocOpen(true)}>目录 {chapterIndex + 1}/{chapters.length}</button>
      <button type="button" className="rd-tool" onClick={changeFontSize} aria-label={`调整字号，当前 ${fontSize}`}>Aa</button>
    </div>
    <article ref={scrollRef} className="rd-paper" style={{ fontSize }} aria-label="书籍正文">
      <h1>{chapter.title}</h1>
      {chapter.paragraphs.map((paragraph, index) => {
        const mark = book.notes.find((item) => item.chapterId === chapter.id && item.paragraphIndex === index);
        return <div className={`rd-paragraph${mark ? " has-note" : ""}`} key={`${chapter.id}-${index}`} data-paragraph={index}>
          {index === hisSpot && <span className="rd-his-spot">{hisName}读到这里</span>}
          <p>{paragraph}</p>
          {mark && <button type="button" className="rd-note-mark" onClick={() => setNote(mark)} aria-label={`看${hisName}在这段的批注`}>批</button>}
        </div>;
      })}
      <p className="rd-chapter-end">{chapterIndex === chapters.length - 1 ? "这一册，到这里读完了。" : "这一章，到这里。"}</p>
      <div className="rd-chapter-nav">
        <button type="button" className="rd-button" disabled={chapterIndex === 0} onClick={() => openChapter(chapters[chapterIndex - 1].id)}>上一章</button>
        <button type="button" className="rd-button" disabled={chapterIndex === chapters.length - 1} onClick={() => openChapter(chapters[chapterIndex + 1].id)}>下一章</button>
      </div>
    </article>
    <div className="rd-reader-status" aria-live="off">你 {herSpot}% · {hisName} {book.him ? `${book.him.percent}%` : "还没开始"}</div>
    {tocOpen && <XpDialog title="目录" onClose={() => setTocOpen(false)}>
      <div className="rd-toc">{chapters.map((item, index) => <button type="button" key={item.id}
        aria-current={item.id === chapterId ? "location" : undefined} onClick={() => openChapter(item.id)}>
        <span>{String(index + 1).padStart(2, "0")}</span>{item.title}
        {book.him?.chapterId === item.id && <em>{hisName}在这</em>}
      </button>)}</div>
    </XpDialog>}
    {note && <XpDialog title={`${hisName}的批注`} onClose={() => setNote(null)}>
      <div className="rd-note-view">{note.quote && <blockquote>{note.quote}</blockquote>}<p>{note.content}</p></div>
      <div className="rd-dialog-buttons"><button type="button" className="rd-button rd-button-default" onClick={() => setNote(null)}>确定</button></div>
    </XpDialog>}
  </div>;
}

export function ReadingView({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const hisName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [shelf, setShelf] = useState<ReadingShelf>("reading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reader, setReader] = useState<{ id: string; chapters: ReadingChapter[] } | null>(null);
  const [form, setForm] = useState<{ book?: ShelfBook } | null>(null);
  const pending = useRef<{ id: string; chapterId: string; paragraphIndex: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const book = books.find((item) => item.id === selectedId) || null;

  const applyBook = useCallback((next: ShelfBook) => {
    setBooks((items) => items.some((item) => item.id === next.id) ? items.map((item) => item.id === next.id ? next : item) : [next, ...items]);
  }, []);

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const data = await readingApi();
        if (disposed) return;
        let shelfBooks = data.books || [];
        setBooks(shelfBooks);
        if (shelfBooks.some((item) => item.shelf === "reading")) setShelf("reading");
        else if (shelfBooks.some((item) => item.shelf === "want")) setShelf("want");
        // Books from the old on-device shelf move to the server once.
        if (localStorage.getItem(LEGACY_MOVED_KEY)) return;
        const legacy = await loadLegacyBooks().catch(() => []);
        let moved = 0;
        const skipped: string[] = [];
        for (const old of legacy) {
          const body = JSON.stringify({ action: "legacy", id: old.id, title: old.title, chapters: old.chapters,
            position: old.position, read: old.lastReadAt > 0, createdAt: old.createdAt });
          if (body.length > 9_500_000) { skipped.push(old.title); continue; }
          try {
            const reply = await readingApi({ method: "POST", headers: { "Content-Type": "application/json" }, body });
            shelfBooks = reply.books || shelfBooks;
            moved += 1;
          } catch { skipped.push(old.title); }
        }
        if (disposed) return;
        if (legacy.length) {
          setBooks(shelfBooks);
          if (moved) setShelf("reading");
          setNotice([moved ? `手机里的 ${moved} 本书搬到书架上了。` : "", skipped.length ? `《${skipped.join("》《")}》没搬成，重新导入一次吧。` : ""].join(""));
        }
        if (!skipped.length || moved) localStorage.setItem(LEGACY_MOVED_KEY, String(Date.now()));
      } catch (error) {
        if (!disposed) setNotice((error as Error).message);
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => { disposed = true; };
  }, []);

  const flushPosition = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const spot = pending.current;
    pending.current = null;
    if (!spot) return;
    try {
      const reply = await postReading({ action: "mark", id: spot.id, chapterId: spot.chapterId, paragraphIndex: spot.paragraphIndex });
      if (reply.book) applyBook(reply.book);
    } catch (error) { setNotice(`进度没存上：${(error as Error).message}`); }
  }, [applyBook]);

  useEffect(() => {
    function hidden() { if (document.visibilityState === "hidden") void flushPosition(); }
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); void flushPosition(); };
  }, [flushPosition]);

  const recordPosition = useCallback((chapterId: string, paragraphIndex: number) => {
    if (!reader) return;
    const current = books.find((item) => item.id === reader.id)?.her;
    if (!pending.current && current?.chapterId === chapterId && current.paragraphIndex === paragraphIndex) return;
    pending.current = { id: reader.id, chapterId, paragraphIndex };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushPosition(); }, 1500);
  }, [reader, books, flushPosition]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); setNotice(""); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function openReader(target: ShelfBook) {
    await run(async () => {
      const data = await readingApi({ query: `book=${encodeURIComponent(target.id)}` });
      if (!data.chapters?.length) throw new Error("这本书的正文找不到了，重新导入一下吧。");
      if (data.book) applyBook(data.book);
      setReader({ id: target.id, chapters: data.chapters });
    });
  }

  async function closeReader() {
    await flushPosition();
    setReader(null);
  }

  async function saveForm(values: BookForm) {
    const fields = { title: values.title.trim(), author: values.author.trim(), shelf: values.shelf,
      wantedBy: values.shelf === "want" ? values.wantedBy : "", blurb: values.blurb.trim() };
    const editing = form?.book;
    const reply = editing ? await postReading({ action: "edit", id: editing.id, ...fields })
      : values.file ? await putReadingText(values.file, fields)
      : await postReading({ action: "add", ...fields });
    if (reply.books) setBooks(reply.books);
    if (reply.book) { setShelf(reply.book.shelf); if (!editing) setSelectedId(reply.book.id); }
    setForm(null);
    setNotice("");
  }

  const reading = reader ? books.find((item) => item.id === reader.id) : null;
  const counts = Object.fromEntries(READING_SHELVES.map((key) => [key, books.filter((item) => item.shelf === key).length])) as Record<ReadingShelf, number>;
  const title = reading ? reading.title : book ? book.title : "我们的书房";

  return <div className="xp-summer-screen rd-screen">
    <section className="xp-summer-window" aria-label="reading">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><BookGlyph /></span><h1>{title} - reading</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口，回到桌面"
            onClick={async () => { await flushPosition(); onBack(); }}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>

      {notice && <div className="rd-notice" role="alert"><span>{notice}</span>
        <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      {reading && reader ? <Reader key={reading.id} book={reading} chapters={reader.chapters} hisName={hisName}
        onPosition={recordPosition} onClose={() => { void closeReader(); }} />
        : <>
          <div className="rd-toolbar">
            {book ? <button type="button" className="rd-tool" onClick={() => setSelectedId(null)}>‹ 书架</button>
              : <button type="button" className="rd-tool" disabled={loading} onClick={() => setForm({})}><span aria-hidden="true">＋</span> 添加</button>}
            <span className="rd-toolbar-note">{book ? SHELF_LABEL[book.shelf] : `${books.length} 本书`}</span>
          </div>
          <div className="rd-content">
            {book ? <BookPage key={book.id} book={book} hisName={hisName} busy={busy}
              onRead={() => { void openReader(book); }}
              onEdit={() => setForm({ book })}
              onDelete={() => {
                if (!window.confirm(`把《${book.title}》从书架上拿下来？进度和批注会一起删掉。`)) return;
                void run(async () => {
                  const reply = await postReading({ action: "delete", id: book.id });
                  if (reply.books) setBooks(reply.books);
                  setSelectedId(null);
                });
              }}
              onMark={(percent) => { void run(async () => {
                const reply = await postReading({ action: "mark", id: book.id, percent });
                if (reply.book) applyBook(reply.book);
              }); }}
              onText={(file) => { void run(async () => {
                checkTxt(file);
                if (book.hasText && !window.confirm("换一份正文的话，书里的批注会清掉，进度只留百分比。要换吗？")) return;
                const reply = await putReadingText(file, { book: book.id });
                if (reply.books) setBooks(reply.books);
              }); }}
            />
              : <>
                <div className="rd-tabs" role="tablist" aria-label="书架">
                  {READING_SHELVES.map((key) => <button type="button" role="tab" key={key} aria-selected={shelf === key}
                    onClick={() => setShelf(key)}>{SHELF_LABEL[key]}{counts[key] ? ` (${counts[key]})` : ""}</button>)}
                </div>
                <div className="rd-tab-panel" role="tabpanel">
                  {loading ? <p className="rd-muted rd-loading" role="status">正在打开书架…</p>
                    : <ShelfList books={books} shelf={shelf} hisName={hisName} onOpen={setSelectedId} />}
                </div>
              </>}
          </div>
        </>}

      <footer className="xp-summer-statusbar">
        <span>{busy ? "请稍候…" : "就绪"}</span>
        <span>{reading ? `正在读《${reading.title}》` : counts.reading ? `在读 ${counts.reading} 本 · 想读 ${counts.want} 本 · 读完 ${counts.done} 本` : "一本书可以读很久。"}</span>
      </footer>
    </section>
    {form && <BookFormDialog initial={bookForm(form.book, shelf)} hisName={hisName} isNew={!form.book}
      onClose={() => setForm(null)} onSubmit={saveForm} />}
  </div>;
}
