"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { WardrobeGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import type { Settings } from "../lib/app-settings";
import { apiFetch } from "../lib/client-api";
import { prepareImageForUpload } from "../lib/image-compress";
import {
  CATEGORY_LABELS, OUTFIT_SLOTS, PATTERN_LABELS, SLOT_LABELS, WARDROBE_CATEGORIES, WARDROBE_LIMITS, WARDROBE_PATTERNS,
  WARDROBE_SHAPES, shapeLabel, slotOf,
  type Outfit, type PixelLook, type WardrobeCategory, type WardrobeItem, type WardrobePattern, type WardrobeTexture,
} from "../lib/wardrobe";
import { outfitLooks, renderDoll, renderGarment, type PixelGrid } from "../lib/wardrobe-pixels";
import { mainColors, paletteFromPixels, textureFromPixels } from "../lib/wardrobe-colors";

// The wardrobe: her clothes as pixel garments, a pixel doll drawn after her
// (curtain bangs, black-to-orange hair, black glasses) to dress up. Tap a
// garment to put it on or take it off; ✎ opens it to fix the shape and colours.

type Reply = { ok: boolean; error?: string; items?: WardrobeItem[]; outfit?: Outfit; item?: WardrobeItem };
type Tab = "all" | WardrobeCategory;
type Crop = { x: number; y: number; w: number; h: number };

async function wardrobeApi(init: RequestInit = {}): Promise<Reply> {
  let response: Response;
  try {
    response = await apiFetch("/api/wardrobe", init);
  } catch {
    throw new Error("连不上衣柜，看看网络再试。");
  }
  const data = await response.json().catch(() => null) as Reply | null;
  if (!response.ok || !data?.ok) throw new Error(data?.error || "衣柜出了点问题，请稍后再试。");
  return data;
}

function postWardrobe(body: Record<string, unknown>) {
  return wardrobeApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function uploadPhoto(file: File) {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await apiFetch("/api/upload", { method: "POST", body: form });
  } catch {
    throw new Error("照片没传上去，看看网络再试。");
  }
  const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "照片没传上去。");
  return data.url;
}

/** A pixel grid drawn crisp: every cell a `scale`-pixel square (sharp on retina too). */
function PixelCanvas({ grid, scale, className, label }: { grid: PixelGrid; scale: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const size = scale * ratio;
    canvas.width = grid.w * size;
    canvas.height = grid.h * size;
    context.clearRect(0, 0, canvas.width, canvas.height);
    grid.cells.forEach((color, index) => {
      if (!color) return;
      context.fillStyle = color;
      context.fillRect((index % grid.w) * size, Math.floor(index / grid.w) * size, size, size);
    });
  }, [grid, scale]);
  return <canvas ref={ref} className={className} style={{ width: grid.w * scale, height: grid.h * scale }}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

/** The biggest whole-pixel scale that fits a grid in a box. */
function fitScale(grid: PixelGrid, box: number) {
  return Math.max(1, Math.floor(Math.min(box / grid.w, box / grid.h)));
}

function Thumb({ look, box }: { look: PixelLook; box: number }) {
  const grid = useMemo(() => renderGarment(look), [look]);
  return <PixelCanvas grid={grid} scale={fitScale(grid, box)} />;
}

// ── Taking colours out of a photo ──

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("这张照片打不开。"));
    image.src = src;
  });
}

/** RGBA pixels of the cropped part, drawn down to at most `max` on the long side. */
function cropPixels(image: HTMLImageElement, crop: Crop, max: number) {
  const sx = crop.x * image.naturalWidth, sy = crop.y * image.naturalHeight;
  const sw = Math.max(1, crop.w * image.naturalWidth), sh = Math.max(1, crop.h * image.naturalHeight);
  const k = max / Math.max(sw, sh);
  const w = Math.max(2, Math.round(sw * k)), h = Math.max(2, Math.round(sh * k));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("这个浏览器取不了色。");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  return { data: context.getImageData(0, 0, w, h).data, w, h };
}

function sampleCrop(image: HTMLImageElement, crop: Crop): { palette: string[]; colors: [string, string]; texture: WardrobeTexture | null } {
  // The middle of the box for the colours, so a sloppy edge doesn't count much.
  const inset = { x: crop.x + crop.w * 0.12, y: crop.y + crop.h * 0.12, w: crop.w * 0.76, h: crop.h * 0.76 };
  const small = cropPixels(image, inset, 40);
  const found = paletteFromPixels(small.data, 6).filter((item, index) => index === 0 || item.share >= 0.03);
  const palette = found.map((item) => item.color);
  const tiny = cropPixels(image, crop, 16);
  return { palette, colors: mainColors(found), texture: textureFromPixels(tiny.data, tiny.w, tiny.h, palette) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const START_CROP: Crop = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };

/** Her photo with a box on it: drag inside to move it, drag elsewhere to draw a new one. */
function CropBox({ src, crop, onChange, onDone }: { src: string; crop: Crop; onChange: (crop: Crop) => void; onDone: (crop: Crop) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "move" | "draw"; x: number; y: number; start: Crop } | null>(null);
  const latest = useRef(crop);

  function point(event: ReactPointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }
  function set(next: Crop) {
    latest.current = next;
    onChange(next);
  }

  return <div className="wd-crop" ref={ref}
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const p = point(event);
      const inside = p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h;
      drag.current = { mode: inside ? "move" : "draw", x: p.x, y: p.y, start: crop };
      if (!inside) set({ x: p.x, y: p.y, w: 0.02, h: 0.02 });
    }}
    onPointerMove={(event) => {
      const state = drag.current;
      if (!state) return;
      const p = point(event);
      if (state.mode === "move") {
        set({ ...state.start, x: clamp(state.start.x + p.x - state.x, 0, 1 - state.start.w), y: clamp(state.start.y + p.y - state.y, 0, 1 - state.start.h) });
      } else {
        set({ x: Math.min(p.x, state.x), y: Math.min(p.y, state.y), w: Math.max(0.02, Math.abs(p.x - state.x)), h: Math.max(0.02, Math.abs(p.y - state.y)) });
      }
    }}
    onPointerUp={() => {
      if (!drag.current) return;
      drag.current = null;
      let next = latest.current;
      // A tap (or a tiny box) makes a box of a sensible size around that spot.
      if (next.w < 0.06 || next.h < 0.06) {
        const w = Math.max(next.w, 0.2), h = Math.max(next.h, 0.2);
        next = { x: clamp(next.x - w / 2, 0, 1 - w), y: clamp(next.y - h / 2, 0, 1 - h), w, h };
        set(next);
      }
      onDone(next);
    }}
    onPointerCancel={() => { drag.current = null; }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="衣服照片" draggable={false} />
    <span className="wd-crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
  </div>;
}

// ── Adding / changing one garment ──

type Draft = {
  category: WardrobeCategory; shape: string; pattern: WardrobePattern; colors: [string, string];
  texture: WardrobeTexture | null; name: string; note: string;
};

function draftOf(item?: WardrobeItem | null, category: WardrobeCategory = "top"): Draft {
  if (item) return {
    category: item.category, shape: item.shape, pattern: item.pattern, colors: item.colors,
    texture: item.texture || null, name: item.name, note: item.note,
  };
  return { category, shape: WARDROBE_SHAPES[category][0].id, pattern: "solid", colors: ["#c8b6a6", "#8a6f5c"], texture: null, name: "", note: "" };
}

function GarmentDialog({ item, items, outfit, category, onClose, onSave, onDelete }: {
  item: WardrobeItem | null; items: WardrobeItem[]; outfit: Outfit; category: WardrobeCategory;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item, category));
  const [photo, setPhoto] = useState<{ src: string; file: File | null }>(() => ({ src: item?.photo || "", file: null }));
  const [crop, setCrop] = useState<Crop>(START_CROP);
  const [palette, setPalette] = useState<string[]>([]);
  const [target, setTarget] = useState<0 | 1>(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef("");
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const sample = useCallback(async (src: string, box: Crop) => {
    try {
      const image = await loadImage(src);
      const found = sampleCrop(image, box);
      setPalette(found.palette);
      setDraft((current) => ({ ...current, colors: found.colors, texture: found.texture || current.texture }));
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "取色失败了。");
    }
  }, []);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("要选一张图片。"); return; }
    setBusy("正在读照片…");
    try {
      const ready = await prepareImageForUpload(file);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(ready);
      setPhoto({ src: objectUrl.current, file: ready });
      setCrop(START_CROP);
      await sample(objectUrl.current, START_CROP);
    } finally {
      setBusy("");
    }
  }

  const look: PixelLook = useMemo(() => ({
    category: draft.category, shape: draft.shape,
    pattern: draft.pattern === "photo" && !draft.texture ? "solid" : draft.pattern,
    colors: draft.colors, texture: draft.texture,
  }), [draft]);
  // The doll in what she has on now, with this one in its place.
  const doll = useMemo(() => {
    const others = { ...outfit };
    delete others[slotOf(draft.category)];
    for (const slot of OUTFIT_SLOTS) if (others[slot] === item?.id) delete others[slot];
    return renderDoll([...outfitLooks(items, others), look]);
  }, [items, outfit, item, draft.category, look]);
  const shapes = WARDROBE_SHAPES[draft.category];

  async function save() {
    if (busy) return;
    setError("");
    try {
      let url = item?.photo || "";
      if (photo.file) { setBusy("正在传照片…"); url = await uploadPhoto(photo.file); }
      else if (!photo.src) url = "";
      setBusy("正在放进衣柜…");
      await onSave({
        category: draft.category, shape: draft.shape, pattern: look.pattern, colors: draft.colors,
        texture: draft.texture, name: draft.name, note: draft.note, photo: url,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "没存上，请再试一次。");
      setBusy("");
    }
  }

  return <XpDialog title={item ? `「${item.name}」` : "放一件衣服进来"} onClose={onClose} className="wd-dialog">
    <form className="rd-form wd-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="wd-maker">
        <div className="wd-photo">
          {photo.src ? <>
            <CropBox src={photo.src} crop={crop} onChange={setCrop} onDone={(box) => { void sample(photo.src, box); }} />
            <small>在照片上拖一个框，框住布料，颜色和花色从框里取。</small>
          </> : <button type="button" className="wd-photo-empty" onClick={() => fileRef.current?.click()}>
            <WardrobeGlyph /><span>选一张衣服的照片</span><small>不传也行，直接挑颜色</small>
          </button>}
          <div className="wd-photo-actions">
            <button type="button" className="rd-button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>{photo.src ? "换照片" : "选照片"}</button>
            {photo.src && <button type="button" className="rd-button" disabled={Boolean(busy)} onClick={() => setPhoto({ src: "", file: null })}>不要照片</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <div className="wd-preview" aria-label="穿上的样子">
          <PixelCanvas grid={doll} scale={3} className="wd-preview-doll" label="小人穿上的样子" />
        </div>
      </div>

      <fieldset className="wd-field">
        <legend>分类</legend>
        <div className="wd-chips">
          {WARDROBE_CATEGORIES.map((key) => <button type="button" key={key} aria-pressed={draft.category === key}
            onClick={() => set({ category: key, shape: WARDROBE_SHAPES[key].some((shape) => shape.id === draft.shape) ? draft.shape : WARDROBE_SHAPES[key][0].id })}>
            {CATEGORY_LABELS[key]}</button>)}
        </div>
      </fieldset>

      <fieldset className="wd-field">
        <legend>版型</legend>
        <div className="wd-shapes">
          {shapes.map((shape) => <button type="button" key={shape.id} aria-pressed={draft.shape === shape.id} onClick={() => set({ shape: shape.id })}>
            <span className="wd-shape-art"><Thumb look={{ ...look, shape: shape.id }} box={40} /></span>
            <span>{shape.label}</span>
          </button>)}
        </div>
      </fieldset>

      <fieldset className="wd-field">
        <legend>颜色</legend>
        <div className="wd-color-row">
          {(["主色", "配色"] as const).map((label, index) => <button type="button" key={label} className="wd-color-target" aria-pressed={target === index}
            onClick={() => setTarget(index as 0 | 1)}>
            <i style={{ background: draft.colors[index] }} />{label}</button>)}
          <label className="wd-color-input"><span className="sr-only">调{target ? "配色" : "主色"}</span>
            <input type="color" value={draft.colors[target]} onChange={(event) => {
              const colors: [string, string] = [...draft.colors];
              colors[target] = event.target.value.toLowerCase();
              set({ colors });
            }} /></label>
        </div>
        {palette.length > 0 && <div className="wd-swatches" aria-label="照片里的颜色">
          {palette.map((color) => <button type="button" key={color} style={{ background: color }} aria-label={`用 ${color}`}
            aria-pressed={draft.colors[target] === color}
            onClick={() => { const colors: [string, string] = [...draft.colors]; colors[target] = color; set({ colors }); }} />)}
        </div>}
      </fieldset>

      <fieldset className="wd-field">
        <legend>花色</legend>
        <div className="wd-chips">
          {WARDROBE_PATTERNS.map((key) => <button type="button" key={key} aria-pressed={look.pattern === key}
            disabled={key === "photo" && !draft.texture} onClick={() => set({ pattern: key })}>{PATTERN_LABELS[key]}</button>)}
        </div>
      </fieldset>

      <label><span>名字</span><input value={draft.name} maxLength={WARDROBE_LIMITS.name} placeholder={shapeLabel(draft.category, draft.shape)}
        onChange={(event) => set({ name: event.target.value })} /></label>
      <label className="wd-note"><span>备注</span><textarea value={draft.note} maxLength={WARDROBE_LIMITS.note} rows={2}
        placeholder="在哪买的、多少钱、配什么好看…" onChange={(event) => set({ note: event.target.value })} /></label>

      {error && <p className="rd-error" role="alert">{error}</p>}
      <div className="rd-dialog-buttons wd-buttons">
        {item && <button type="button" className="rd-button wd-delete" disabled={Boolean(busy)} onClick={async () => {
          if (!window.confirm(`把「${item.name}」从衣柜里拿走？`)) return;
          setBusy("正在拿走…");
          try { await onDelete(); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "没删掉，请再试一次。"); setBusy(""); }
        }}>拿走</button>}
        <button type="submit" className="rd-button rd-button-default" disabled={Boolean(busy)}>{busy || (item ? "保存" : "放进衣柜")}</button>
        <button type="button" className="rd-button" onClick={onClose}>取消</button>
      </div>
    </form>
  </XpDialog>;
}

// ── The window ──

export function WardrobeView({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const herName = settings.userName || "宝宝";
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfit, setOutfit] = useState<Outfit>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<{ item: WardrobeItem | null } | null>(null);

  const apply = useCallback((reply: Reply) => {
    if (reply.items) setItems(reply.items);
    if (reply.outfit) setOutfit(reply.outfit);
  }, []);

  useEffect(() => {
    let alive = true;
    wardrobeApi()
      .then((reply) => { if (alive) apply(reply); })
      .catch((error: Error) => { if (alive) setNotice(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apply]);

  const looks = useMemo(() => outfitLooks(items, outfit), [items, outfit]);
  const doll = useMemo(() => renderDoll(looks), [looks]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const shown = tab === "all" ? items : items.filter((item) => item.category === tab);
  const counts = Object.fromEntries(WARDROBE_CATEGORIES.map((key) => [key, items.filter((item) => item.category === key).length])) as Record<WardrobeCategory, number>;
  const wearing = new Set(Object.values(outfit));

  /** Dress the doll; the change shows at once and goes back if it didn't save. */
  async function wear(next: Outfit) {
    const before = outfit;
    setOutfit(next);
    setBusy(true);
    try { apply(await postWardrobe({ action: "wear", outfit: next })); setNotice(""); }
    catch (error) { setOutfit(before); setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  function toggle(item: WardrobeItem) {
    const slot = slotOf(item.category);
    const next = { ...outfit };
    if (next[slot] === item.id) delete next[slot];
    else next[slot] = item.id;
    void wear(next);
  }

  function takeOff(slot: keyof Outfit) {
    const next = { ...outfit };
    delete next[slot];
    void wear(next);
  }

  return <div className="xp-summer-screen rd-screen wd-screen">
    <section className="xp-summer-window" aria-label="wardrobe">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><WardrobeGlyph /></span><h1>{herName}的衣柜 - wardrobe</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>

      <div className="rd-toolbar">
        <button type="button" className="rd-tool" disabled={loading} onClick={() => setEditing({ item: null })}><span aria-hidden="true">＋</span> 放衣服</button>
        <button type="button" className="rd-tool" disabled={loading || busy || !looks.length} onClick={() => { void wear({}); }}>全部脱下</button>
        <span className="rd-toolbar-note">{items.length} 件</span>
      </div>

      {notice && <div className="rd-notice" role="alert"><span>{notice}</span>
        <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      <div className="rd-content wd-content">
        <section className="wd-stage" aria-label="小人">
          <div className="wd-mirror"><PixelCanvas grid={doll} scale={4} className="wd-doll" label={`${herName}的小人`} /></div>
          <ul className="wd-slots">
            {OUTFIT_SLOTS.map((slot) => {
              const on = outfit[slot] ? byId.get(outfit[slot]!) : undefined;
              return <li key={slot}>
                <span className="wd-slot-name">{SLOT_LABELS[slot]}</span>
                {on ? <>
                  <button type="button" className="wd-slot-item" onClick={() => setEditing({ item: on })}>{on.name}</button>
                  <button type="button" className="wd-slot-off" disabled={busy} aria-label={`脱下${on.name}`} onClick={() => takeOff(slot)}>×</button>
                </> : <span className="wd-slot-empty">—</span>}
              </li>;
            })}
          </ul>
        </section>

        <section className="wd-closet" aria-label="衣柜">
          <div className="rd-tabs wd-tabs" role="tablist" aria-label="分类">
            {(["all", ...WARDROBE_CATEGORIES] as Tab[]).map((key) => <button type="button" role="tab" key={key} aria-selected={tab === key}
              onClick={() => setTab(key)}>{key === "all" ? "全部" : CATEGORY_LABELS[key]}{key !== "all" && counts[key] ? ` ${counts[key]}` : ""}</button>)}
          </div>
          <div className="rd-tab-panel wd-panel" role="tabpanel">
            {loading ? <p className="rd-muted rd-loading" role="status">正在打开衣柜…</p>
              : !shown.length ? <div className="rd-empty"><WardrobeGlyph />
                <p>{items.length ? `还没有${CATEGORY_LABELS[tab as WardrobeCategory]}。` : "衣柜还空着。"}</p>
                <small>点「放衣服」，拍一件衣服放进来，它会变成像素的。</small>
                <button type="button" className="rd-button" onClick={() => setEditing({ item: null })}>放一件</button>
              </div>
              : <ul className="wd-grid">
                {shown.map((item) => {
                  const on = wearing.has(item.id);
                  return <li key={item.id} className={on ? "is-on" : undefined}>
                    <button type="button" className="wd-tile" aria-pressed={on} disabled={busy} onClick={() => toggle(item)}
                      title={on ? "点一下脱下" : "点一下穿上"}>
                      <span className="wd-tile-art"><Thumb look={item} box={56} /></span>
                      <span className="wd-tile-name">{item.name}</span>
                      {on && <i className="wd-tile-on">穿着</i>}
                    </button>
                    <button type="button" className="wd-tile-edit" aria-label={`看看「${item.name}」`} onClick={() => setEditing({ item })}>✎</button>
                  </li>;
                })}
              </ul>}
          </div>
        </section>
      </div>

      <footer className="xp-summer-statusbar">
        <span>{busy ? "请稍候…" : loading ? "正在打开…" : "点衣服穿上或脱下，✎ 看看这件"}</span>
        <span>{WARDROBE_CATEGORIES.filter((key) => counts[key]).map((key) => `${CATEGORY_LABELS[key]} ${counts[key]}`).join(" · ") || "今天穿什么呢"}</span>
      </footer>
    </section>
    {editing && <GarmentDialog key={editing.item?.id || "new"} item={editing.item} items={items} outfit={outfit}
      category={tab === "all" ? "top" : tab}
      onClose={() => setEditing(null)}
      onSave={async (input) => {
        const reply = editing.item
          ? await postWardrobe({ action: "edit", id: editing.item.id, item: input })
          : await postWardrobe({ action: "add", item: input });
        apply(reply);
        if (!editing.item && reply.item && tab !== "all" && tab !== reply.item.category) setTab(reply.item.category);
        setEditing(null);
        setNotice("");
      }}
      onDelete={async () => {
        apply(await postWardrobe({ action: "delete", id: editing.item!.id }));
        setEditing(null);
      }} />}
  </div>;
}
