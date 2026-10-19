"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "@/app/lib/client-api";
import { categoryOf } from "@/app/lib/dayday-ledger";
import { prepareImageForUpload } from "@/app/lib/image-compress";
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
      // eslint-disable-next-line @next/next/no-img-element -- her own uploads, shown as they are
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

/** A picked photo: previewed locally, uploaded (compressed) only when she saves. */
export function usePhoto() {
  const [file, setFile] = useState<File | undefined>();
  const [image, setImage] = useState<string | undefined>();
  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);
  return {
    image,
    pick(next?: File | null) { setFile(next || undefined); setImage(next ? URL.createObjectURL(next) : undefined); },
    /** The saved /uploads/... address, or undefined when no photo was picked. Throws when the upload fails. */
    async upload() {
      if (!file) return undefined;
      const form = new FormData();
      form.append("file", await prepareImageForUpload(file));
      const response = await apiFetch("/api/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "图片没传上去，再试一次。");
      return data.url as string;
    },
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
