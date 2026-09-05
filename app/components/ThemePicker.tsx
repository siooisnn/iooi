"use client";

import { setTheme, useTheme } from "./ThemeProvider";

const THEMES = [
  { id: "warm", name: "暖杏", description: "熟悉的暖色小窝" },
  { id: "white-pink", name: "白桃", description: "白灰底色，一点粉" },
] as const;

export function ThemePicker() {
  const theme = useTheme();
  return (
    <div className="settings-group">
      <h2 className="settings-group-title" id="theme-title">外观</h2>
      <div className="theme-options" role="group" aria-labelledby="theme-title">
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            className="theme-option"
            aria-pressed={theme === option.id}
            onClick={() => setTheme(option.id)}
          >
            <span className={`theme-preview theme-preview-${option.id}`} aria-hidden="true">
              <span className="theme-preview-header"><i /><i /><i /></span>
              <span className="theme-preview-message theme-preview-ai" />
              <span className="theme-preview-message theme-preview-user" />
              <span className="theme-preview-input"><i /></span>
            </span>
            <span className="theme-option-name">{option.name}<span aria-hidden="true">{theme === option.id ? "✓" : ""}</span></span>
            <span className="theme-option-description">{option.description}</span>
          </button>
        ))}
      </div>
      <p className="settings-hint">随时换回来，选择会保存在这台设备上。</p>
    </div>
  );
}
