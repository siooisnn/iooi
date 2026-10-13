"use client";

export function PhoneSettings({ appearance, onChange, onBack }: {
  appearance: "day" | "night";
  onChange: (appearance: "day" | "night") => void;
  onBack: () => void;
}) {
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
          className="sp-appearance-option" aria-pressed={appearance === value} onClick={() => onChange(value)}>
          <span className="sp-appearance-preview" data-preview={value} aria-hidden="true">
            <i /><b>{symbol}</b><span /><span /><span /><span />
          </span>
          <span>{label}</span>
          <span className="sp-appearance-check" aria-hidden="true">{appearance === value ? "✓" : ""}</span>
        </button>)}
      </div>
      <p className="sp-settings-hint">白天的柔白，夜里的微光。选择后自动保存。</p>
    </div>
  </div>;
}
