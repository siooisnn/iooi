export type SummerWriteLike = {
  id?: string;
  layer?: string;
  date?: string;
  title?: string;
  content?: string;
  status?: string;
};

type SummerSnapshot = {
  layers?: Record<string, unknown>;
  xiazhi?: unknown;
  xiaoshu_tail?: unknown;
  xiaoshu_recent?: unknown;
  rain?: unknown;
  ferry?: unknown;
};

const ITEM_LAYERS = ["xiazhi", "xiaoshu", "rain", "ferry"] as const;
const DOCUMENT_LAYERS = ["lixia", "xiaoman", "mangzhong"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function ngrams(value: string, size: number) {
  const result = new Set<string>();
  if (!value) return result;
  if (value.length < size) {
    result.add(value);
    return result;
  }
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return (2 * overlap) / (left.size + right.size);
}

function textSimilarity(left: string, right: string, size: number) {
  return diceCoefficient(ngrams(left, size), ngrams(right, size));
}

function sameMemory(candidate: SummerWriteLike, existing: SummerWriteLike) {
  if (String(candidate.layer || "").toLowerCase() !== String(existing.layer || "").toLowerCase()) {
    return false;
  }

  const candidateContent = normalizedText(candidate.content);
  const existingContent = normalizedText(existing.content);
  if (!candidateContent || !existingContent) return false;
  if (candidateContent === existingContent) return true;

  const shorterLength = Math.min(candidateContent.length, existingContent.length);
  const longerLength = Math.max(candidateContent.length, existingContent.length);
  if (
    shorterLength >= 18
    && (candidateContent.includes(existingContent) || existingContent.includes(candidateContent))
    && shorterLength / longerLength >= 0.45
  ) {
    return true;
  }

  const bigramSimilarity = textSimilarity(candidateContent, existingContent, 2);
  const trigramSimilarity = textSimilarity(candidateContent, existingContent, 3);
  if (bigramSimilarity >= 0.44 && trigramSimilarity >= 0.24) return true;

  const candidateTitle = normalizedText(candidate.title);
  const existingTitle = normalizedText(existing.title);
  if (!candidateTitle || !existingTitle) return false;
  if (candidateTitle === existingTitle && bigramSimilarity >= 0.18) return true;
  return textSimilarity(candidateTitle, existingTitle, 2) >= 0.72 && bigramSimilarity >= 0.22;
}

export function summerWriteFromUnknown(value: unknown): SummerWriteLike | null {
  if (!isRecord(value)) return null;
  const content = String(value.content || "").trim();
  const layer = String(value.layer || "").trim().toLowerCase();
  if (!content || !layer) return null;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    layer,
    date: typeof value.date === "string" ? value.date : undefined,
    title: typeof value.title === "string" ? value.title : "",
    content,
    status: typeof value.status === "string" ? value.status : undefined,
  };
}

function snapshotItems(value: unknown, layer: string) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const parsed = summerWriteFromUnknown({ ...item, layer });
        return parsed ? [parsed] : [];
      })
    : [];
}

export function summerWritesFromSnapshot(snapshot: unknown): SummerWriteLike[] {
  if (!isRecord(snapshot)) return [];
  const typed = snapshot as SummerSnapshot;
  const result: SummerWriteLike[] = [];
  const seen = new Set<string>();

  const add = (item: SummerWriteLike) => {
    const key = item.id || `${item.layer}\u0001${normalizedText(item.title)}\u0001${normalizedText(item.content)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };

  for (const layer of ITEM_LAYERS) {
    const values = layer === "xiaoshu"
      ? [...snapshotItems(typed.xiaoshu_tail, layer), ...snapshotItems(typed.xiaoshu_recent, layer)]
      : snapshotItems(typed[layer], layer);
    values.forEach(add);
  }

  if (isRecord(typed.layers)) {
    for (const layer of DOCUMENT_LAYERS) {
      const content = String(typed.layers[layer] || "").trim();
      if (content) add({ layer, title: layer, content });
    }
  }
  return result;
}

export function findDuplicateSummerWrite(
  candidate: SummerWriteLike,
  existingWrites: SummerWriteLike[],
) {
  return existingWrites.find((existing) => sameMemory(candidate, existing)) || null;
}

export function filterDuplicateSummerWrites<T extends SummerWriteLike>(
  candidates: T[],
  existingWrites: SummerWriteLike[],
) {
  const accepted: T[] = [];
  const comparisonPool = [...existingWrites];
  for (const candidate of candidates) {
    if (findDuplicateSummerWrite(candidate, comparisonPool)) continue;
    accepted.push(candidate);
    comparisonPool.push(candidate);
  }
  return accepted;
}
