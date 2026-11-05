const locks = globalThis as { __iooiWritingTail?: Promise<void> };
export async function withWritingLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = locks.__iooiWritingTail || Promise.resolve();
  let release!: () => void;
  locks.__iooiWritingTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await task(); } finally { release(); }
}
