"use client";

import { cleanReplySteps, summerWriteTitle, type ReplyStep } from "../lib/reply-steps";

/** Receipts for submitted Summer changes, never raw tool output or thinking. */
export function SummerWriteCards({ steps }: { steps: ReplyStep[] }) {
  const writes = cleanReplySteps(steps).filter((step) => step.group === "summer_write" && step.summerWrite);
  if (!writes.length) return null;
  return <div className="summer-write-receipts" aria-label="Summer 操作内容">
    {writes.map((step, index) => {
      const detail = step.summerWrite!;
      const preview = detail.content || detail.oldContent || detail.fields?.join(" · ") || detail.itemId || "";
      return <details key={`${step.t}-${index}`} className="summer-write-receipt">
        <summary>
          <span className="summer-write-receipt-title">{summerWriteTitle(step)}</span>
          {preview && <span className="summer-write-receipt-preview">{preview.slice(0, 140)}{preview.length > 140 ? "…" : ""}</span>}
          <span className="summer-write-receipt-toggle"><span className="summer-write-open">展开内容</span><span className="summer-write-close">收起内容</span></span>
        </summary>
        <div className="summer-write-receipt-body">
          {step.status !== "success" && <p className="summer-write-receipt-notice">{step.status === "failed" ? "本次提交失败，下面是尝试提交的内容。" : "下面是提交内容，是否保存成功尚未确认。"}</p>}
          {detail.itemId && <p>条目：{detail.itemId}</p>}
          {detail.oldContent !== undefined && <section><h4>修改前片段</h4><pre>{detail.oldContent}</pre></section>}
          {detail.content !== undefined && <section><h4>{detail.action === "update" ? "本次修改内容" : "本次写入内容"}</h4><pre>{detail.content}</pre></section>}
          {detail.fields?.length ? <p>{detail.fields.join("\n")}</p> : null}
          {detail.action === "delete" && <p>{step.status === "success" ? "已删除此条目。" : "本次操作为删除此条目。"}</p>}
          {detail.truncated && <p className="summer-write-receipt-notice">内容较长，这里显示前 2 万字；完整内容请在 Summer 查看。</p>}
        </div>
      </details>;
    })}
  </div>;
}
