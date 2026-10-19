"use client";

import { DaydayGlyph } from "./RetroDesktop";

// dayday is being rebuilt as her real-money ledger with a little shop inside.
// Until then the window only holds its place on the desktop.
export function DaydayView({ onBack }: { onBack: () => void }) {
  return <div className="xp-summer-screen rd-screen dd-screen">
    <section className="xp-summer-window" aria-label="dayday 记账">
      <header className="xp-summer-titlebar"><span className="dd-title-icon"><DaydayGlyph /></span><h1>dayday记账</h1>
        <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭 dayday" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="dd-body">
        <header className="dd-brand"><h2>dayday<span>生活慢慢来</span></h2></header>
        <section className="dd-paper dd-empty"><h3>正在改成记账本</h3><p>记账、小商城、待补和存钱罐都在路上。</p></section>
        <footer className="dd-footer">dayday · 和你一起认真过日子</footer>
      </div>
    </section>
  </div>;
}
