import { readStore, withStore } from "./store";
import { addLifeEntry, readLifeLog } from "./life-log";

export function clawdAutonomyOn() {
  return (readStore()?.settings as Record<string, unknown> | undefined)?.lifeClawd === true;
}
export function guardClawdAutonomy() {
  if (!clawdAutonomyOn()) throw new Error("小砖的心跳照顾已关闭。");
}
export async function logClawdCare(action: string, requestId: string, source: "life" | "elsewhere") {
  const words: Record<string, string> = { feed: "给小砖喂了饭", pet: "摸了摸小砖的头", play: "陪小砖玩了一会儿", bath: "给小砖洗了澡", sleep: "哄小砖睡觉", wake: "把小砖叫醒了", wear: "帮小砖换了穿戴" };
  await withStore((store) => {
    const ref = `clawd:${requestId}`;
    if (readLifeLog(store).some((entry) => entry.kind === "clawd" && entry.ref === ref)) return;
    addLifeEntry(store, { kind: "clawd", text: words[action] || "照顾了小砖", ref, source });
  });
}
