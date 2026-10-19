import type { ClawdAction, ClawdPet } from "./clawd-pet";

export const CLAWD_ACTIONS: ClawdAction[] = ["feed", "pet", "play", "bath", "sleep", "wake"];
export const CLAWD_WARDROBE = { head: ["beanie", "bow", "sprout"], body: ["scarf", "bowtie"], hand: ["flower", "balloon"] };
export type ClawdActor = "her" | "susu";
export type ClawdVisit = { at: number; action: ClawdAction; count: number; by: ClawdActor };
export type ClawdOutfitState = Partial<Record<keyof typeof CLAWD_WARDROBE, string>>;
export type ClawdTalk = { id: string; at: number; by: ClawdActor; mine: string; his: string };
export type ClawdSnapshot = {
  pet: ClawdPet | null; visits: ClawdVisit[]; outfit: ClawdOutfitState; talks: ClawdTalk[]; modelReady: boolean;
};
