import { readStore, withStore } from "./store";
import type { CodeProject } from "./claude-code-task";

export type CodeTaskState = {
  taskId: string;
  project: CodeProject;
  status: "running" | "done" | "error" | "interrupted";
  progress: string;
  startedAt: number;
  updatedAt: number;
  pid: number;
};

type CodeTaskStates = Record<string, CodeTaskState>;

export function getCodeTaskState(sessionId: string): CodeTaskState | null {
  const states = readStore()?.codeTaskStates as CodeTaskStates | undefined;
  const state = states?.[sessionId];
  if (!state) return null;
  if (state.status === "running" && state.pid !== process.pid) {
    return { ...state, status: "interrupted", progress: "服务器在任务期间重新启动，请查看工作区改动后再继续。" };
  }
  return state;
}

export async function startCodeTask(sessionId: string, taskId: string, project: CodeProject) {
  const now = Date.now();
  await withStore((store) => {
    const states = (store.codeTaskStates || {}) as CodeTaskStates;
    states[sessionId] = {
      taskId, project, status: "running", progress: "已收到任务，正在准备工作区…",
      startedAt: now, updatedAt: now, pid: process.pid,
    };
    store.codeTaskStates = states;
  });
}

export async function updateCodeTask(
  sessionId: string,
  taskId: string,
  status: CodeTaskState["status"],
  progress: string,
) {
  await withStore((store) => {
    const states = (store.codeTaskStates || {}) as CodeTaskStates;
    const current = states[sessionId];
    if (!current || current.taskId !== taskId) return;
    states[sessionId] = { ...current, status, progress, updatedAt: Date.now() };
    store.codeTaskStates = states;
  });
}
