"use client";

import { IconBack } from "./NavIcons";

/** The floating title of a desktop app page: ‹ back on the left, title pill in the middle. */
export function PageHeader({ title, subtitle, onBack }: { title?: string; subtitle?: string; onBack: () => void }) {
  return (
    <header className="chat-header compact-section-header page-header">
      <div className="header-top">
        <button type="button" className="header-icon-btn page-back" onClick={onBack} aria-label="返回">
          <IconBack />
        </button>
        <div className="header-center">
          {title && <h1 className="header-title">{title}</h1>}
          {subtitle && <span className="header-subtitle">{subtitle}</span>}
        </div>
        <span className="header-icon-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}
