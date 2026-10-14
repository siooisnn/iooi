"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Image from "next/image";
import type { Settings } from "../../lib/app-settings";
import { normalizeChatBackground, prepareChatBackground } from "../../lib/chat-background";

function WallpaperSetting({ title, background, onChange }: {
  title: string; background: string; onChange: (background: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try { onChange(await prepareChatBackground(file, { maxSide: 1280, maxLength: 500_000 })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "无法读取这张图片。"); }
    finally { setBusy(false); }
  }
  return <section className="sp-wallpaper-setting" aria-label={title}>
    <div className="sp-wallpaper-copy"><h3>{title}</h3><span>{background ? "已设置照片" : "默认壁纸"}</span></div>
    {background && <Image className="sp-wallpaper-preview" src={background} alt={`当前${title}`} width={48} height={68} unoptimized />}
    <input ref={input} className="sp-wallpaper-input" type="file" accept="image/*" aria-label={`选择${title}`} disabled={busy} onChange={(event) => void choose(event)} />
    <div className="sp-wallpaper-actions">
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "处理中…" : background ? "更换图片" : "选择图片"}</button>
      {background && <button type="button" disabled={busy} aria-label={`移除${title}`} onClick={() => { onChange(""); setError(""); }}>移除</button>}
    </div>
    {error && <p className="sp-wallpaper-error" role="alert">{error}</p>}
  </section>;
}

export function PhoneSettings({ settings, updateSettings, onBack }: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onBack: () => void;
}) {
  const appearance = settings.susuPhoneAppearance === "day" ? "day" : "night";
  return <div className="sp-page sp-settings">
    <header className="sp-page-bar">
      <button type="button" className="sp-page-back" aria-label="回到手机桌面" onClick={onBack}>‹</button>
      <h2>设置</h2>
    </header>
    <div className="sp-scroll">
      <h3 className="sp-settings-title">显示与外观</h3>
      <div className="sp-appearance-options" role="group" aria-label="手机外观">
        {([
          { value: "day", label: "日间", symbol: "☀" },
          { value: "night", label: "夜间", symbol: "☾" },
        ] as const).map(({ value, label, symbol }) => <button type="button" key={value}
          className="sp-appearance-option" aria-pressed={appearance === value} onClick={() => updateSettings({ susuPhoneAppearance: value })}>
          <span className="sp-appearance-preview" data-preview={value} aria-hidden="true">
            <i /><b>{symbol}</b><span /><span /><span /><span />
          </span>
          <span>{label}</span>
          <span className="sp-appearance-check" aria-hidden="true">{appearance === value ? "✓" : ""}</span>
        </button>)}
      </div>
      <p className="sp-settings-hint">白天的柔白，夜里的微光。选择后自动保存。</p>
      <h3 className="sp-settings-title sp-wallpaper-title">壁纸</h3>
      <WallpaperSetting title="锁屏壁纸" background={normalizeChatBackground(settings.susuPhoneLockBackground)} onChange={(susuPhoneLockBackground) => updateSettings({ susuPhoneLockBackground })} />
      <WallpaperSetting title="桌面壁纸" background={normalizeChatBackground(settings.susuPhoneHomeBackground)} onChange={(susuPhoneHomeBackground) => updateSettings({ susuPhoneHomeBackground })} />
    </div>
  </div>;
}
