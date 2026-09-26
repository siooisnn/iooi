import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readStore, withStore } from "./store";
import type { CodeProject } from "./claude-code-task";
import type { CodeReleaseAction } from "./code-release-command";

export type CodeReleaseState = {
  taskId: string;
  project: CodeProject;
  action: CodeReleaseAction;
  status: "running" | "done" | "error";
  progress: string;
  result?: string;
  startedAt: number;
  updatedAt: number;
  pid?: number;
};

export function readCodeReleaseState(sessionId: string): CodeReleaseState | null {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) return null;
  const path = join(process.cwd(), "data", "code-release", `${sessionId}.json`);
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as CodeReleaseState;
    if (!state?.taskId || !["running", "done", "error"].includes(state.status)) return null;
    if (state.status === "running" && Date.now() - state.updatedAt > 30_000) {
      let alive = false;
      try { if (state.pid) { process.kill(state.pid, 0); alive = true; } } catch { /* Worker exited. */ }
      if (!alive) return { ...state, status: "error", progress: "发布任务中断",
        result: "发布进程意外中断。请先检查服务器版本状态，再决定是否重试。" };
    }
    return state;
  } catch { return null; }
}

export async function startCodeRelease(action: CodeReleaseAction, project: CodeProject, sessionId: string, taskId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(taskId)) {
    throw new Error("发布任务标识无效");
  }
  const current = readCodeReleaseState(sessionId);
  if (current?.status === "running") throw new Error("已有发布任务在执行，请等它完成。");
  const directory = join(process.cwd(), "data", "code-release");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const now = Date.now();
  writeFileSync(join(directory, `${sessionId}.json`), JSON.stringify({
    taskId, project, action, status: "running", progress: "已收到发布指令，正在启动…",
    startedAt: now, updatedAt: now,
  }), { encoding: "utf8", mode: 0o600 });
  const child = spawn("/usr/local/sbin/iooi-release-request", [action, project, sessionId, taskId], {
    detached: true,
    stdio: "ignore",
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", reject);
    });
  } catch (error) {
    writeFileSync(join(directory, `${sessionId}.json`), JSON.stringify({
      taskId, project, action, status: "error", progress: "发布任务未能启动",
      startedAt: now, updatedAt: Date.now(),
    }), { encoding: "utf8", mode: 0o600 });
    throw error;
  }
  child.unref();
}

export async function persistCodeReleaseResult(sessionId: string, state: CodeReleaseState) {
  if (state.status === "running" || !state.result) return;
  const existing = (readStore()?.sessions as Array<{ id: string; messages: Array<Record<string, unknown>> }> | undefined)
    ?.find((item) => item.id === sessionId);
  if (!existing || existing.messages.some((message) => message.role === "assistant" && message.roundId === state.taskId
    && message.source === `code_task_${state.project}`)) return;
  await withStore((store) => {
    const sessions = store.sessions as Array<{ id: string; messages: Array<Record<string, unknown>> }> | undefined;
    const session = sessions?.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.messages.some((message) => message.role === "assistant" && message.roundId === state.taskId
      && message.source === `code_task_${state.project}`)) return;
    session.messages.push({
      role: "assistant", content: state.result, source: `code_task_${state.project}`,
      roundId: state.taskId,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }),
      date: new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
    });
  });
}
