// clawd, the little pet on the desktop. Everything here is pure so the page
// and the tests share one set of rules: stats run 0–100 and drift with real
// time, actions nudge them back, and nothing ever dies — at worst he sulks.

export const CLAWD_STORAGE_KEY = "iooi-clawd";

export type ClawdStatKey = "hunger" | "mood" | "energy" | "clean";
export type ClawdStats = Record<ClawdStatKey, number>;

export type ClawdPet = {
  version: 1;
  name: string;
  bornAt: number;
  updatedAt: number;
  asleep: boolean;
  stats: ClawdStats;
};

export type ClawdAction = "feed" | "pet" | "play" | "bath" | "sleep" | "wake";
export type ClawdState = "sleeping" | "hungry" | "tired" | "dirty" | "sad" | "happy" | "ok";

export const CLAWD_STATS: { key: ClawdStatKey; label: string }[] = [
  { key: "hunger", label: "饱腹" },
  { key: "mood", label: "心情" },
  { key: "energy", label: "精力" },
  { key: "clean", label: "清洁" },
];

const HOUR = 60 * 60 * 1000;

// Points per hour. Awake he gets hungry in about a day; asleep he refills
// his energy in roughly six hours.
const AWAKE_DRIFT: ClawdStats = { hunger: -4, mood: -3, energy: -3, clean: -2 };
const ASLEEP_DRIFT: ClawdStats = { hunger: -1.5, mood: 0, energy: 15, clean: -0.5 };
// Hungry or grubby, his mood sinks a little faster.
const NEGLECT_MOOD_DRIFT = -2;
const LOW = 25;

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 10) / 10;

export function createClawd(now: number): ClawdPet {
  return {
    version: 1,
    name: "clawd",
    bornAt: now,
    updatedAt: now,
    asleep: false,
    stats: { hunger: 80, mood: 80, energy: 90, clean: 90 },
  };
}

/** Reads whatever localStorage held; anything unusable starts a new clawd. */
export function parseClawd(raw: unknown, now: number): ClawdPet {
  if (!raw || typeof raw !== "object") return createClawd(now);
  const data = raw as Partial<ClawdPet>;
  const stats = data.stats as Partial<ClawdStats> | undefined;
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (!stats || !CLAWD_STATS.every(({ key }) => finite(stats[key])) || !finite(data.bornAt) || !finite(data.updatedAt)) {
    return createClawd(now);
  }
  return {
    version: 1,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 12) : "clawd",
    bornAt: Math.min(data.bornAt, now),
    updatedAt: Math.min(data.updatedAt, now),
    asleep: Boolean(data.asleep),
    stats: {
      hunger: clamp(stats.hunger as number),
      mood: clamp(stats.mood as number),
      energy: clamp(stats.energy as number),
      clean: clamp(stats.clean as number),
    },
  };
}

/** Lets the stats drift for the time since he was last looked at. */
export function advanceClawd(pet: ClawdPet, now: number): ClawdPet {
  const hours = Math.max(0, now - pet.updatedAt) / HOUR;
  if (hours === 0) return pet;

  let asleep = pet.asleep;
  let sleepHours = 0;
  let awakeHours = hours;
  if (asleep) {
    // He wakes on his own once his energy is full.
    const toFull = (100 - pet.stats.energy) / ASLEEP_DRIFT.energy;
    sleepHours = Math.min(hours, toFull);
    awakeHours = hours - sleepHours;
    if (awakeHours > 0) asleep = false;
  }

  const stats = { ...pet.stats };
  for (const { key } of CLAWD_STATS) {
    stats[key] = clamp(stats[key] + ASLEEP_DRIFT[key] * sleepHours + AWAKE_DRIFT[key] * awakeHours);
  }
  if (awakeHours > 0 && (stats.hunger < LOW || stats.clean < LOW)) {
    stats.mood = clamp(stats.mood + NEGLECT_MOOD_DRIFT * awakeHours);
  }
  for (const { key } of CLAWD_STATS) stats[key] = round(stats[key]);

  return { ...pet, asleep, stats, updatedAt: now };
}

/** Why he won't do something right now, or null if he will. */
export function clawdRefusal(pet: ClawdPet, action: ClawdAction): string | null {
  const { stats } = pet;
  if (pet.asleep && action !== "pet" && action !== "wake") return "嘘，他在睡觉";
  switch (action) {
    case "feed": return stats.hunger >= 95 ? "吃不下啦，肚子圆滚滚" : null;
    case "play":
      if (stats.energy < 15) return "太困了，玩不动了";
      if (stats.hunger < 10) return "饿得没力气玩";
      return null;
    case "bath": return stats.clean >= 95 ? "已经香香的了" : null;
    case "sleep": return stats.energy >= 90 ? "还不困，再陪我一会儿" : null;
    case "wake": return pet.asleep ? null : "他醒着呢";
    default: return null;
  }
}

/** Applies an action after catching the stats up to now. */
export function actClawd(pet: ClawdPet, action: ClawdAction, now: number): ClawdPet {
  const current = advanceClawd(pet, now);
  if (clawdRefusal(current, action)) return current;
  const stats = { ...current.stats };
  let asleep = current.asleep;
  const add = (key: ClawdStatKey, amount: number) => { stats[key] = round(clamp(stats[key] + amount)); };

  switch (action) {
    case "feed": add("hunger", 28); add("mood", 3); add("clean", -3); break;
    case "pet": add("mood", asleep ? 3 : 8); break;
    case "play": add("mood", 18); add("energy", -14); add("hunger", -8); add("clean", -8); break;
    case "bath": stats.clean = 100; add("mood", 2); break;
    case "sleep": asleep = true; break;
    case "wake": asleep = false; add("mood", -2); break;
  }
  return { ...current, asleep, stats };
}

export function clawdState(pet: ClawdPet): ClawdState {
  const { stats } = pet;
  if (pet.asleep) return "sleeping";
  if (stats.hunger < LOW) return "hungry";
  if (stats.energy < 20) return "tired";
  if (stats.clean < LOW) return "dirty";
  if (stats.mood < 35) return "sad";
  if (stats.mood >= 75 && stats.hunger >= 50) return "happy";
  return "ok";
}

const LINES: Record<ClawdState, string[]> = {
  sleeping: ["zZ……", "（梦里在写代码）", "呼……呼……"],
  hungry: ["肚子咕咕叫了", "想吃点东西……", "token 快用完了，要饭饭"],
  tired: ["有点困了", "眼睛快睁不开了", "想睡一小会儿"],
  dirty: ["身上沾了好多 bug", "想洗澡……", "有点黏糊糊的"],
  sad: ["陪我玩一会儿嘛", "你是不是忘了我", "好无聊……"],
  happy: ["今天也很喜欢你", "我可以帮你写代码！", "嘿嘿", "你来啦！"],
  ok: ["在这儿呢", "今天想做点什么？", "（横着走了两步）"],
};

const REACTIONS: Record<ClawdAction, string[]> = {
  feed: ["好吃！", "吧唧吧唧", "还有吗？"],
  pet: ["再摸摸", "嘿嘿，痒", "（蹭蹭你的手）"],
  play: ["再来一次！", "好好玩！", "你追不上我～"],
  bath: ["干干净净", "泡泡！", "香香的"],
  sleep: ["晚安", "那我睡啦", "明天见"],
  wake: ["唔……早呀", "醒了醒了", "我还没睡够……"],
};

const pick = (lines: string[], seed: number) => lines[Math.abs(Math.floor(seed)) % lines.length];

export function clawdLine(pet: ClawdPet, seed: number): string {
  return pick(LINES[clawdState(pet)], seed);
}

export function clawdReaction(action: ClawdAction, seed: number): string {
  return pick(REACTIONS[action], seed);
}

/** Which day he is on, counting the day he arrived as day one. */
export function clawdAgeDays(pet: ClawdPet, now: number): number {
  return Math.floor(Math.max(0, now - pet.bornAt) / (24 * HOUR)) + 1;
}
