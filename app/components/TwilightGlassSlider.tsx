"use client";

import { useState } from "react";
import { resolveTwilightGlass, twilightGlassScale } from "../lib/twilight-bubbles";

// Dragging previews on the page directly; the setting is saved once on release
// so each step does not rewrite every stored setting.
export function TwilightGlassSlider({ value, onChange, className = "" }: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const saved = resolveTwilightGlass(value);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? saved;

  const preview = (next: number) => {
    setDragging(next);
    document.documentElement.style.setProperty("--twilight-glass", twilightGlassScale(next));
  };
  const commit = () => {
    if (dragging === null) return;
    setDragging(null);
    if (dragging !== saved) onChange(dragging);
  };

  return (
    <label className={`twilight-glass-slider ${className}`.trim()}>
      <span className="twilight-glass-scale" aria-hidden="true">清透</span>
      <input type="range" min={0} max={100} step={5} value={shown} aria-label="玻璃质感程度"
        aria-valuetext={`${shown}%`}
        onChange={(event) => preview(Number(event.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} onTouchEnd={commit} />
      <span className="twilight-glass-scale" aria-hidden="true">磨砂</span>
      <output className="twilight-glass-value">{shown}</output>
    </label>
  );
}
