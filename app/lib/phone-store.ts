import { readPhoneSettingsStore, readReadingStore, readStore, readSurfStore, withPhoneSettingsStore } from "./store";
import { buildPhoneSnapshot, decoratePhone } from "./susu-phone";

export function readPhone(now = new Date()) {
  return buildPhoneSnapshot(readStore(), readReadingStore(), readSurfStore(), readPhoneSettingsStore(), now);
}

export function changePhoneDecoration(input: Record<string, unknown>) {
  return withPhoneSettingsStore((store) => {
    const next = decoratePhone(store, input);
    Object.assign(store, next);
    return next;
  });
}
