"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/* The iOS lock screen: a live clock over the wallpaper, one slide to get in.
   Pointer events so fingers and mice feel the same; a tap anywhere on the
   track (or Enter on the thumb) also unlocks. */
const THUMB = 44; // thumb width inside the 46px track
const UNLOCK_RATIO = 0.6;

function lockTime(now: Date) {
  return now.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
}
function lockDate(now: Date) {
  return now.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" });
}

export function PhoneLockScreen({ now, onUnlock }: { now: Date; onUnlock: () => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const moved = useRef(false);
  const unlocked = useRef(false);
  const dxRef = useRef(0);

  const range = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (unlocked.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    moved.current = false;
    setDragging(true);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (Math.abs(event.clientX - startX.current) > 4) moved.current = true;
    const next = Math.max(0, Math.min(event.clientX - startX.current, range()));
    dxRef.current = next;
    setDx(next);
  }
  function finish() {
    if (!dragging) return;
    setDragging(false);
    if (dxRef.current >= range() * UNLOCK_RATIO) {
      unlocked.current = true;
      onUnlock();
    } else {
      dxRef.current = 0;
      setDx(0);
    }
  }
  function onTap() {
    if (!moved.current && !unlocked.current) {
      unlocked.current = true;
      onUnlock();
    }
  }

  return (
    <div className="sp-lock">
      <div className="sp-lock-mid">
        <span className="sp-lock-date">{lockDate(now)}</span>
        <time className="sp-lock-clock" dateTime={now.toISOString()}>{lockTime(now)}</time>
      </div>
      <div className={`sp-unlock${dragging ? " is-dragging" : ""}`} ref={trackRef} role="group" aria-label="滑动来解锁"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onClick={onTap}>
        <span className="sp-unlock-label" aria-hidden="true">滑动来解锁</span>
        <button type="button" className="sp-unlock-thumb" aria-label="滑动来解锁" style={{ transform: `translateX(${dx}px)` }}>›</button>
      </div>
    </div>
  );
}
