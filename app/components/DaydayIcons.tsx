/** One thin-line icon set for dayday, so every glyph shares the shop's stroke and colour. */
const PATHS: Record<string, string> = {
  shop: "M4 10.5 12 4l8 6.5M6 9v10h12V9M10 19v-5h4v5",
  bag: "M5 8h14l-1.2 11H6.2zM9 8V6.5a3 3 0 0 1 6 0V8",
  bank: "M3.5 9.5 12 5l8.5 4.5M5 10v7M9.7 10v7M14.3 10v7M19 10v7M3.5 19.5h17",
  heart: "M12 19s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 7.6a3.7 3.7 0 0 1 7 2.1C19 14.6 12 19 12 19z",
  gear: "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6",
  search: "M10.5 5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM15 15l4.5 4.5",
  饮食: "M4 11h16a8 8 0 0 1-16 0zM9 6.5c0-1 1-1 1-2M13 6.5c0-1 1-1 1-2M8 21h8",
  衣物: "M9 4 4 7l2 3.5 2-1V20h8V9.5l2 1L20 7l-5-3a3 3 0 0 1-6 0z",
  日用: "M7 5h10v14H7zM7 9h10M10.5 13h3",
  书籍: "M12 6.5C10 5 7 4.8 4 5.5v13c3-.7 6-.5 8 1 2-1.5 5-1.7 8-1v-13c-3-.7-6-.5-8 1zM12 6.5v13",
  小砖专属: "M4.5 10h15v10h-15zM3.5 7h17v3h-17zM12 7v13M12 7c-1.5-3-5-3.2-5-1.2S10 7 12 7c2 0 5 .8 5-1.2S13.5 4 12 7",
  goods: "M5 8h14l-1.2 11H6.2zM9 8V6.5a3 3 0 0 1 6 0V8M9.5 12.5a2.5 2.5 0 0 0 5 0",
};

export function DaydayIcon({ name, className }: { name: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name] || PATHS.goods} />
  </svg>;
}
