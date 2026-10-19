"use client";

import { useEffect, useRef, useState } from "react";
import { DaydayGlyph } from "./RetroDesktop";
import { TabIcon } from "./dayday/DaydayArt";
import { EntryDialog, LedgerPage } from "./dayday/LedgerPage";
import { ShelfDialog, ShopPage } from "./dayday/ShopPage";
import { ItemsPage } from "./dayday/ItemsPage";
import { NotebookPage } from "./dayday/NotebookPage";
import { useDayday } from "./dayday/use-dayday";
import type { Entry } from "./dayday/dayday-data";

const PAGES = [
  { id: "ledger", label: "账本" },
  { id: "shop", label: "商城" },
  { id: "items", label: "我的物品" },
  { id: "notes", label: "小本本" },
] as const;
type Page = typeof PAGES[number]["id"];

/** dayday 记账: her real money, a little shop for things she is eyeing, and what she owns. */
export function DaydayView({ onBack, initialPage = "ledger" }: { onBack: () => void; initialPage?: Page }) {
  const dd = useDayday();
  const [page, setPage] = useState<Page>(initialPage);
  const [writing, setWriting] = useState<Entry | "new" | null>(null);
  const [addingShelf, setAddingShelf] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);
  const { notice, actions } = dd;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(actions.dismiss, notice.undo ? 6000 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice, actions.dismiss]);

  return <div className="xp-summer-screen rd-screen dd-screen">
    <section className="xp-summer-window" aria-label="dayday 记账">
      <header className="xp-summer-titlebar"><span className="dd-title-icon"><DaydayGlyph /></span><h1>dayday记账</h1>
        <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭 dayday" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="dd-strip"><b>dayday</b><span>和你一起认真过日子</span><em>预览 · 假数据，刷新就会还原</em></div>
      {notice && <div className="dd-toast" role="status"><span>{notice.text}</span>
        {notice.undo && <button type="button" onClick={notice.undo}>撤销</button>}
        <button type="button" aria-label="收起提示" onClick={actions.dismiss}>×</button></div>}
      <div className="dd-body" ref={bodyRef}>
        {page === "ledger" && <LedgerPage dd={dd} onWrite={() => setWriting("new")} onEdit={setWriting} />}
        {page === "shop" && <ShopPage dd={dd} onAddShelf={() => setAddingShelf(true)} />}
        {page === "items" && <ItemsPage dd={dd} onAddShelf={() => setAddingShelf(true)} />}
        {page === "notes" && <NotebookPage dd={dd} />}
      </div>
      <nav className="dd-nav" aria-label="dayday">
        {PAGES.map((p) => <button type="button" key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
          <TabIcon name={p.id} /><span>{p.label}</span>
          {p.id === "shop" && dd.state.orders.length > 0 && <i className="dd-dot">{dd.state.orders.length}</i>}
          {p.id === "notes" && dd.state.refills.length > 0 && <i className="dd-dot">{dd.state.refills.length}</i>}
        </button>)}
      </nav>
    </section>
    {writing && <EntryDialog dd={dd} entry={writing === "new" ? undefined : writing} onClose={() => setWriting(null)} />}
    {addingShelf && <ShelfDialog onSave={(label) => dd.actions.addShelf(label)} onClose={() => setAddingShelf(false)} />}
  </div>;
}
