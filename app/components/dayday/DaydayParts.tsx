"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { categoryOf } from "./dayday-data";
import { ShelfArt } from "./DaydayArt";

/** A round category sticker with one character on it. */
export function CatSticker({ cat }: { cat: string }) {
  const c = categoryOf(cat);
  return <span className="dd-sticker" style={{ background: c.tint }} aria-hidden="true">{c.mark}</span>;
}

/** A product or item picture, or a pixel drawing of its shelf when there is no photo. */
export function Art({ image, shelf, name, className = "" }: { image?: string; shelf: string; name: string; className?: string }) {
  return <span className={`dd-art ${className}`.trim()}>
    {image
      // eslint-disable-next-line @next/next/no-img-element -- local blob previews before upload exists
      ? <img src={image} alt={name} />
      : <ShelfArt shelf={shelf} />}
  </span>;
}

/** A group box: a framed section with its caption sitting on the line, like an XP dialog. */
export function Group({ title, extra, children, className = "" }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dd-group ${className}`.trim()}>
    <header className="dd-group-title"><h3>{title}</h3>{extra}</header>
    {children}
  </section>;
}

/** A local picture preview. Real uploads arrive with the server step. */
export function useLocalImage() {
  const [image, setImage] = useState<string | undefined>();
  const kept = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (image && image !== kept.current) URL.revokeObjectURL(image); }, [image]);
  return {
    image,
    pick(file?: File | null) { setImage(file ? URL.createObjectURL(file) : undefined); },
    // Ownership moves to the saved record, so the preview must not revoke it.
    keep() { kept.current = image; return image; },
  };
}

export function PhotoPicker({ image, onPick }: { image?: string; onPick: (file?: File | null) => void }) {
  return <label className="dd-photo-pick">
    {image
      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
      ? <img src={image} alt="已选的图片" />
      : <span><b>＋</b>选一张图</span>}
    <input type="file" accept="image/*" onChange={(e) => onPick(e.target.files?.[0])} />
  </label>;
}
