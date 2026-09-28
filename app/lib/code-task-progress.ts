export function codeTaskProgress(event: { type?: string; subtype?: string; status?: string | null; message?: { content?: Array<{ type?: string; name?: string }> } }): string[] {
  if (event.type === "system") {
    if (event.subtype === "status" && event.status === "compacting") return ["正在压缩上下文…"];
    if (event.subtype === "compact_boundary") return ["上下文压缩完成，正在继续工作…"];
  }
  if (event.type !== "assistant") return [];
  return (event.message?.content || []).filter((block) => block.type === "tool_use").map((block) =>
    block.name === "Edit" || block.name === "Write" ? "正在修改代码…"
      : block.name === "Bash" ? "正在执行项目命令或检查…" : "正在查看项目文件…");
}
