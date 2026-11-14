export const CODE_PROJECTS = ["iooi", "summer", "iooiblog", "writing"] as const;
export type CodeProject = typeof CODE_PROJECTS[number];

export const CODE_PROJECT_LABELS: Record<CodeProject, string> = {
  iooi: "iooi", summer: "Summer", iooiblog: "iooiblog", writing: "写写",
};

export function isCodeProject(value: unknown): value is CodeProject {
  return CODE_PROJECTS.some((project) => project === value);
}

export function canDeployCodeProject(project: CodeProject) {
  return isCodeProject(project) && project !== "writing";
}

/** The work project a chat window was last used for, or undefined for a plain chat window. */
export function sessionWorkProject(messages: ReadonlyArray<{ source?: string }>): CodeProject | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const project = CODE_PROJECTS.find((name) => messages[index].source === `code_task_${name}`);
    if (project) return project;
  }
  return undefined;
}
