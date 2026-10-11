"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

/** A modal XP dialog (styled by reading-room.css: put it inside an .rd-screen window). */
export function XpDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog className="rd-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="rd-dialog-title"><h2 id={titleId}>{title}</h2>
      <button type="button" className="rd-dialog-close" onClick={onClose} aria-label="关闭"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
    </header>
    <div className="rd-dialog-body">{children}</div>
  </dialog>;
}
