export function StartupScreen({ error, slow, onRetry }: { error: string; slow: boolean; onRetry: () => void }) {
  return (
    <main className="app-bg startup-screen">
      <section className="startup-window" aria-labelledby="startup-title">
        <div className="startup-titlebar"><span aria-hidden="true">✉</span> iooi · 小窝</div>
        <div className="startup-content">
          <h1 id="startup-title">{error ? "连接暂时没完成" : "正在打开小窝"}</h1>
          <p role={error ? "alert" : "status"} aria-live="polite">
            {error || (slow ? "网络有点慢，还在读取聊天记录……" : "正在连接，读取聊天记录……")}
          </p>
          {!error && <div className="startup-track" aria-hidden="true"><span /></div>}
          <p className="startup-note">{error ? "现有聊天记录会保留，不会用空数据覆盖。" : "请稍等，读完后就能进来。"}</p>
          <div className="startup-actions">
            {error && <button type="button" onClick={onRetry}>重新连接</button>}
            {/* Full navigation must also work before JavaScript has loaded. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">重新打开</a>
          </div>
        </div>
      </section>
    </main>
  );
}
