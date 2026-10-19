"use client";

import { useEffect, useRef, useState } from "react";
import { DaydayGlyph } from "./RetroDesktop";
import { TabIcon } from "./dayday/DaydayArt";
import { EntryDialog, LedgerPage } from "./dayday/LedgerPage";
import { ShelfDialog, ShopPage } from "./dayday/ShopPage";
import { ItemsPage } from "./dayday/ItemsPage";
import { NotebookPage, SettingsDialog } from "./dayday/NotebookPage";
import { useDayday } from "./dayday/use-dayday";
import type { Entry } from "@/app/lib/dayday-ledger";

const PAGES = [
  { id: "ledger", label: "账本" },
  { id: "shop", label: "商城" },
  { id: "items", label: "我的物品" },
  { id: "notes", label: "小本本" },
] as const;
type Page = typeof PAGES[number]["id"];

/** dayday 记账: her real money, a little shop for things she is eyeing, and what she owns. */
export function DaydayView({ onBack, initialPage = "ledger" }: { onBack: () => void; initialPage?: Page }) {
  const { dd, loadError, reload, notice, dismiss } = useDayday();
  const [page, setPage] = useState<Page>(initialPage);
  const [writing, setWriting] = useState<Entry | "new" | null>(null);
  const [addingShelf, setAddingShelf] = useState(false);
  const [setup, setSetup] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, notice.undo || notice.error ? 6000 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  return <div className="xp-summer-screen rd-screen dd-screen">
    <section className="xp-summer-window" aria-label="dayday 记账">
      <header className="xp-summer-titlebar"><span className="dd-title-icon"><DaydayGlyph /></span><h1>dayday记账</h1>
        <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭 dayday" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="dd-strip"><b>dayday</b><span>和你一起认真过日子</span></div>
      {notice && <div className={`dd-toast${notice.error ? " is-error" : ""}`} role={notice.error ? "alert" : "status"}><span>{notice.text}</span>
        {notice.undo && <button type="button" onClick={notice.undo}>撤销</button>}
        <button type="button" aria-label="收起提示" onClick={dismiss}>×</button></div>}
      <div className="dd-body" ref={bodyRef}>
        {!dd ? <div className="dd-loading">{loadError
          ? <><p className="dd-error" role="alert">{loadError}</p><button type="button" className="dd-btn" onClick={() => void reload()}>再试一次</button></>
          : <p className="dd-empty">正在翻开账本…</p>}</div> : <>
          {page === "ledger" && <LedgerPage dd={dd} onWrite={() => setWriting("new")} onEdit={setWriting} onSetup={() => setSetup(true)} />}
          {page === "shop" && <ShopPage dd={dd} onAddShelf={() => setAddingShelf(true)} />}
          {page === "items" && <ItemsPage dd={dd} onAddShelf={() => setAddingShelf(true)} />}
          {page === "notes" && <NotebookPage dd={dd} />}
        </>}
      </div>
      <nav className="dd-nav" aria-label="dayday">
        {PAGES.map((p) => <button type="button" key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
          <TabIcon name={p.id} /><span>{p.label}</span>
          {p.id === "shop" && !!dd?.state.orders.length && <i className="dd-dot">{dd.state.orders.length}</i>}
          {p.id === "notes" && !!dd?.state.refills.length && <i className="dd-dot">{dd.state.refills.length}</i>}
        </button>)}
      </nav>
    </section>
    {dd && writing && <EntryDialog dd={dd} entry={writing === "new" ? undefined : writing} onClose={() => setWriting(null)} />}
    {dd && addingShelf && <ShelfDialog onSave={(label) => void dd.actions.addShelf(label)} onClose={() => setAddingShelf(false)} />}
    {dd && setup && <SettingsDialog dd={dd} onClose={() => setSetup(false)} />}
  </div>;
}
