"use client";

import { useState } from "react";

// Temporary tuning control: how far title bars sit below iOS's status-bar blur.
// The value lives only on this device and is applied before first paint by
// applyStoredStatusBarClearance(); drop this once a fixed value is chosen.
const STORAGE_KEY = "iooi-status-bar-clearance";
export const DEFAULT_STATUS_BAR_CLEARANCE = 16;
const MIN = 0;
const MAX = 24;

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_STATUS_BAR_CLEARANCE;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(MAX, Math.max(MIN, Math.round(value))) : DEFAULT_STATUS_BAR_CLEARANCE;
  } catch {
    return DEFAULT_STATUS_BAR_CLEARANCE;
  }
}

function apply(value: number) {
  document.documentElement.style.setProperty("--status-bar-clearance", `${value}px`);
}

export function applyStoredStatusBarClearance() {
  const value = readStored();
  if (value !== DEFAULT_STATUS_BAR_CLEARANCE) apply(value);
}

export function StatusBarClearanceSlider() {
  const [value, setValue] = useState(readStored);

  const change = (next: number) => {
    setValue(next);
    apply(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Preview still works without storage. */ }
  };

  return (
    <div className="status-bar-clearance">
      <label className="twilight-glass-slider status-bar-clearance-slider">
        <span className="twilight-glass-scale" aria-hidden="true">上</span>
        <input type="range" min={MIN} max={MAX} step={1} value={value} aria-label="标题下移距离"
          aria-valuetext={`${value}px`} onChange={(event) => change(Number(event.target.value))} />
        <span className="twilight-glass-scale" aria-hidden="true">下</span>
        <output className="twilight-glass-value">{value}px</output>
      </label>
      {value !== DEFAULT_STATUS_BAR_CLEARANCE && (
        <button type="button" className="status-bar-clearance-reset" onClick={() => change(DEFAULT_STATUS_BAR_CLEARANCE)}>
          恢复 {DEFAULT_STATUS_BAR_CLEARANCE}px
        </button>
      )}
    </div>
  );
}
