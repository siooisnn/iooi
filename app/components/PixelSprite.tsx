// Tiny pixel-art helper: each row is a string, each character one square
// pixel. "." is empty; other characters look up their colour in the palette.
// Runs of the same colour on a row merge into one <rect> to keep the DOM small.

type Props = {
  rows: string[];
  palette: Record<string, string>;
  className?: string;
};

export function PixelSprite({ rows, palette, className }: Props) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const fill = palette[ch];
      if (!fill) { x += 1; continue; }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return (
    <g className={className}>
      {rects.map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </g>
  );
}
