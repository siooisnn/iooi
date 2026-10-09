"use client";

import { IconBack } from "./NavIcons";

/** The round ‹ at the bottom right of every desktop app page, where the thumb
 *  rests. Pages have no title bar; the content starts at the top. */
export function PageBack({ onBack, label = "返回桌面" }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="page-back-float" onClick={onBack} aria-label={label}>
      <IconBack size={22} />
    </button>
  );
}
