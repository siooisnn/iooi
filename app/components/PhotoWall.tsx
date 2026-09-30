"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import Image from "next/image";
import { HOME_WALL_ASPECTS, prepareHomeWallPhoto } from "../lib/home-wall";
import styles from "./PhotoWall.module.css";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 10;

// Positions are percentages of the wall box (height 1.15-1.32x its width).
// The top row hangs from the top edge and the bottom row sits on the bottom
// edge, so taller phones only widen the gap between rows. The bottom row sits
// a little above that edge so it doesn't crowd the note below.
// Frame 0 is the 4:3 landscape; the other three are squares of different sizes.
const FRAMES: Array<{ left: number; top?: number; bottom?: number; width: number; tilt: number; hung?: boolean }> = [
  { left: 3, top: 3, width: 58, tilt: 0 },
  { left: 68, top: 10, width: 29, tilt: -2, hung: true },
  { left: 6, bottom: 13, width: 36, tilt: 1.5 },
  { left: 49, bottom: 8, width: 47, tilt: -0.6 },
];

type Press = { index: number; x: number; y: number; timer: number };

export function PhotoWall({ photos, onChangePhoto, days, hours, minutes, seconds, ready, children }: {
  photos: string[];
  onChangePhoto: (index: number, photo: string) => void;
  days: number; hours: number; minutes: number; seconds: number; ready: boolean;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const press = useRef<Press | null>(null);
  const menuSettling = useRef(false);
  const pendingIndex = useRef<number | null>(null);
  const [pressing, setPressing] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function openMenu(index: number) {
    // The finger that finished a long press must not immediately close the sheet.
    menuSettling.current = true;
    window.setTimeout(() => { menuSettling.current = false; }, 400);
    setError("");
    setMenu(index);
  }

  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setPressing(null);
  }

  function startPress(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (busy !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelPress();
    const timer = window.setTimeout(() => {
      press.current = null;
      setPressing(null);
      try { navigator.vibrate?.(12); } catch { /* Haptics are optional. */ }
      openMenu(index);
    }, LONG_PRESS_MS);
    press.current = { index, x: event.clientX, y: event.clientY, timer };
    setPressing(index);
  }

  function movePress(event: PointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > MOVE_TOLERANCE) cancelPress();
  }

  function openFromContextMenu(event: MouseEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    cancelPress();
    if (busy === null) openMenu(index);
  }

  // Taps do nothing (no accidental uploads); keyboard activation opens the menu.
  function clickFrame(event: MouseEvent<HTMLButtonElement>, index: number) {
    if (event.detail === 0 && busy === null) openMenu(index);
  }

  function closeMenu() {
    if (menuSettling.current) return;
    setMenu(null);
  }

  function choosePhoto() {
    if (menu === null) return;
    pendingIndex.current = menu;
    setMenu(null);
    inputRef.current?.click();
  }

  function removePhoto() {
    if (menu === null) return;
    onChangePhoto(menu, "");
    setMenu(null);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const index = pendingIndex.current;
    pendingIndex.current = null;
    if (!file || index === null) return;
    setBusy(index);
    setError("");
    try {
      onChangePhoto(index, await prepareHomeWallPhoto(file, HOME_WALL_ASPECTS[index]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片读取失败，请重新选择。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className={`chat-header home-header ${styles.header}`}>
        <div className="header-top">
          <h1 className={styles.plate}><span>iooi</span></h1>
        </div>
      </header>

      <section className={styles.room}>
        {children}
        <div className={styles.stage}>
          <div className={styles.wall}>
            {FRAMES.map((frame, index) => {
              const photo = photos[index] || "";
              const aspect = HOME_WALL_ASPECTS[index];
              return (
                <button
                  key={index}
                  type="button"
                  className={styles.frame}
                  data-hung={frame.hung ? "true" : undefined}
                  data-pressing={pressing === index ? "true" : undefined}
                  data-busy={busy === index ? "true" : undefined}
                  style={{
                    left: `${frame.left}%`, width: `${frame.width}%`,
                    top: frame.bottom === undefined ? `${frame.top}%` : undefined,
                    bottom: frame.bottom === undefined ? undefined : `${frame.bottom}%`,
                    "--tilt": `${frame.tilt}deg`,
                  } as CSSProperties & Record<"--tilt", string>}
                  aria-label={`第 ${index + 1} 幅画，长按更换照片`}
                  aria-haspopup="dialog"
                  onPointerDown={(event) => startPress(event, index)}
                  onPointerMove={movePress}
                  onPointerUp={cancelPress}
                  onPointerCancel={cancelPress}
                  onPointerLeave={cancelPress}
                  onContextMenu={(event) => openFromContextMenu(event, index)}
                  onClick={(event) => clickFrame(event, index)}
                >
                  {frame.hung && (
                    <span className={styles.hanger} aria-hidden="true">
                      <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                        <path d="M50 3 L14 30 M50 3 L86 30" vectorEffect="non-scaling-stroke" />
                      </svg>
                      <span className={styles.nail} />
                    </span>
                  )}
                  <span className={styles.mat}>
                    <span className={styles.picture} style={{ aspectRatio: String(aspect) }}>
                      {photo ? (
                        <Image src={photo} alt="" fill unoptimized draggable={false} sizes="50vw" />
                      ) : (
                        <span className={styles.empty} aria-hidden="true">
                          <span className={styles.emptyPlus}>+</span>
                          <span className={styles.emptyHint}>长按放照片</span>
                        </span>
                      )}
                      {busy === index && <span className={styles.busy}>挂上去…</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.note}>
          <p className={styles.promise}>此后我们的每一秒都是恩赐</p>
          <div className={styles.clock} role="timer" aria-label="在一起的时间">
            {[{ value: days, unit: "天" }, { value: hours, unit: "时" }, { value: minutes, unit: "分" }, { value: seconds, unit: "秒" }].map(({ value, unit }) => (
              <span className={styles.timePart} key={unit}>
                <span className={styles.number}>{ready ? String(value).padStart(2, "0") : "—"}</span>
                <span className={styles.unit}>{unit}</span>
              </span>
            ))}
          </div>
        </div>

        {error && <p className={styles.toast} role="alert">{error}</p>}
      </section>

      <input ref={inputRef} type="file" accept="image/*" className={styles.fileInput}
        tabIndex={-1} aria-hidden="true" onChange={(event) => void upload(event)} />

      {menu !== null && (
        <div className={styles.sheetBackdrop} onClick={closeMenu}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`第 ${menu + 1} 幅画`}
            onClick={(event) => event.stopPropagation()}>
            <p className={styles.sheetTitle}>第 {menu + 1} 幅画</p>
            <button type="button" className={styles.sheetButton} onClick={choosePhoto} autoFocus>
              {photos[menu] ? "换一张照片" : "选一张照片"}
            </button>
            {photos[menu] && (
              <button type="button" className={`${styles.sheetButton} ${styles.sheetDanger}`} onClick={removePhoto}>
                取下这张
              </button>
            )}
            <button type="button" className={`${styles.sheetButton} ${styles.sheetCancel}`} onClick={() => setMenu(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
