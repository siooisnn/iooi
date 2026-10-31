import { randomUUID } from "crypto";
import { readCapsuleStore, withCapsuleStore } from "./store";
import { letterText, openLetter, parseCapsules, sealLetter, viewLetter, type CapsuleWho } from "./capsules";

export function listCapsules() {
  return parseCapsules(readCapsuleStore());
}

export function viewCapsules(now = new Date()) {
  return listCapsules().map((letter) => viewLetter(letter, now));
}

export async function sealCapsule(from: CapsuleWho, input: Record<string, unknown>, now = new Date()) {
  return withCapsuleStore((raw) => {
    const letters = parseCapsules(raw);
    const letter = sealLetter(letters, from, input, randomUUID(), now);
    raw.letters = letters;
    return viewLetter(letter, now);
  });
}

export async function openCapsule(who: CapsuleWho, id: unknown, now = new Date()) {
  return withCapsuleStore((raw) => {
    const letters = parseCapsules(raw);
    const letter = openLetter(letters, who, id, now);
    raw.letters = letters;
    return viewLetter(letter, now);
  });
}

/** Reread an opened letter, either direction. Sealed ones stay sealed. */
export function rereadCapsule(id: unknown) {
  const letter = listCapsules().find((l) => l.id === id);
  if (!letter) throw new Error("没有找到这封信，先用 capsule_read 看看 id。");
  if (!letter.openedAt) throw new Error(letter.from === "him" ? "这封她还没拆，信封着，你也看不到。" : "这封还没拆。");
  return letterText(letter);
}
