import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";

const key = Symbol.for("iooi.group-reply-fixture");
const f = { store: { sessions: [] }, jobs: [], inputs: [], tools: [], exports: [], record: null };
globalThis[key] = f;
const fixture = 'const f = globalThis[Symbol.for("iooi.group-reply-fixture")];';
const mocks = new Map([
  ["next/server", `${fixture} export const after = (fn) => f.jobs.push(fn);`],
  ["@/app/lib/store", `${fixture} export const readGroupStore = () => f.store; export const withGroupStore = async (fn) => fn(f.store);`],
  ["@/app/lib/claude-code", `${fixture} export const runClaudeCodeChat = async (input) => { f.inputs.push(input); if(f.fail) throw new Error('interrupted'); return {reply:'群聊回复'}; };`],
  ["@/app/lib/group-writing-tools", `${fixture}
    export const notePath = (scope) => '讨论记录/' + scope.sessionId + '/' + scope.speaker + '.md';
    export const WRITING_TOOLS = [{name:'writing_write',description:'write',inputSchema:{type:'object'}}];
    export const writingRecord = async (scope) => { f.tools.push({name:'record',scope}); return f.record; };
    export const callWritingTool = async (name,args,scope) => { f.tools.push({name,args,scope}); return {ok:true}; };`],
  ["@/app/lib/writing-files", `${fixture} export const snapshotWritingFiles = async () => new Map(); export const exportWritingFiles = async () => ({files:f.exports});`],
]);
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (mocks.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    const alias = "@/" + relative(fileURLToPath(new URL("../", import.meta.url)), fileURLToPath(url)).replaceAll("\\", "/").replace(/\.ts$/, "");
    if (mocks.has(alias)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(alias))}`, shortCircuit: true };
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { POST } = await import("../app/api/group/reply/route.ts");

test("group endpoint excludes memory, isolates Claude MCP and saves writing results", async () => {
  const oldToken = process.env.IOOI_TOKEN;
  process.env.IOOI_TOKEN = "test-token";
  const body = { speaker: "claude", mode: "chat", groupSessionId: "group-a", groupSessionName: "论文群", messages: [{ role: "user", content: "讨论一下" }], userMsg: { role: "user", content: "讨论一下", time: "12:00", roundId: "r1" } };
  const request = (input, token = "test-token") => POST(new Request("http://local/api/group/reply", { method: "POST", headers: { "content-type": "application/json", "x-iooi-token": token }, body: JSON.stringify(input) }));
  const run = async (input) => {
    f.jobs = [];
    const response = await request(input);
    await Promise.all(f.jobs.map((fn) => fn()));
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    return events.at(-1);
  };
  try {
    assert.equal((await request(body, "wrong")).status, 401);
    assert.equal((await request({ ...body, speaker: "unknown" })).status, 400);
    const first = await run(body);
    assert.equal(first.status, 200);
    assert.deepEqual(f.inputs[0].isolatedMcp, { servers: {}, tools: [] });
    assert.equal(f.inputs[0].chatTools, undefined);
    assert.equal(f.tools.length, 0);
    assert.doesNotMatch(f.inputs[0].systemPrompt, /PRIVATE_SUMMER|summer_remember layer=/);
    assert.equal(f.store.sessions[0].messages.length, 2);
    await run(body);
    assert.equal(f.inputs.length, 1, "duplicate requests reuse the saved response");
    f.record = { content: "本群提纲待完成", sha256: "abc" };
    f.exports = [{ id: "document", name: "提纲.md", size: 12 }];
    const result = await run({ ...body, mode: "writing", userMsg: { ...body.userMsg, roundId: "r2" } });
    assert.match(f.inputs.at(-1).systemPrompt, /本群提纲待完成/);
    assert.match(f.inputs.at(-1).systemPrompt, /讨论记录\/group-a\/claude.md/);
    assert.deepEqual(Object.keys(f.inputs.at(-1).isolatedMcp.servers), ["writing"]);
    assert.equal(result.messages[0].writingFiles[0].name, "提纲.md");
    f.fail = true;
    const partial = await run({ ...body, mode: "writing", userMsg: { ...body.userMsg, roundId: "r3" } });
    assert.equal(partial.messages[0].source, "group_error");
    assert.equal(partial.messages[0].writingFiles[0].name, "提纲.md");
    assert.equal(f.store.sessions[0].messages.at(-1).roundId, "r3");
  } finally {
    if (oldToken === undefined) delete process.env.IOOI_TOKEN; else process.env.IOOI_TOKEN = oldToken;
    hooks.deregister(); delete globalThis[key];
  }
});
