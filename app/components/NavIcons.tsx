"use client";


// Icons: outline at rest; the current tab fills black and keeps its
// details as white cut-outs.
export type NavIconProps = { active: boolean };
export const NAV_CUT = "#fff";

export function IconHome({ active }: NavIconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {active
        ? <path d="M9.6 22v-6.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1V22" fill={NAV_CUT} stroke="none" />
        : <polyline points="9 22 9 13 15 13 15 22" />}
    </svg>
  );
}

export function IconChat({ active }: NavIconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      {active && (
        <g fill={NAV_CUT} stroke="none">
          <circle cx="8" cy="10" r="1.25" />
          <circle cx="12" cy="10" r="1.25" />
          <circle cx="16" cy="10" r="1.25" />
        </g>
      )}
    </svg>
  );
}

export function IconDiary({ active }: NavIconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill={active ? "currentColor" : "none"} />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke={active ? NAV_CUT : "currentColor"} />
      <line x1="8" y1="7" x2="16" y2="7" stroke={active ? NAV_CUT : "currentColor"} />
      <line x1="8" y1="11" x2="13" y2="11" stroke={active ? NAV_CUT : "currentColor"} />
    </svg>
  );
}

export function IconSettings({ active }: NavIconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" fill={active ? NAV_CUT : "none"} stroke={active ? "none" : "currentColor"} />
    </svg>
  );
}
