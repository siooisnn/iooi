export type CodeReleaseAction = "deploy" | "push";

export function parseCodeReleaseCommand(text: string): CodeReleaseAction | null {
  const command = text.trim().replace(/[。！!]+$/, "").trim();
  if (/^\/?(?:请|现在|帮我)?(?:部署|发布)(?:吧|当前版本|这次改动)?$/.test(command)) return "deploy";
  if (/^\/?(?:请|现在|帮我)?(?:推送|推送到\s*GitHub|推到\s*GitHub)(?:吧|当前版本|这次改动)?$/i.test(command)) return "push";
  return null;
}
