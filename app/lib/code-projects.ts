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
