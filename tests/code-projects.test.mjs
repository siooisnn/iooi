import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";

const { isCodeProject, canDeployCodeProject } = await import("../app/lib/code-projects.ts");
const { loadDevelopmentModePrefs, inferDevelopmentModePref, DEVELOPMENT_MODE_KEY } = await import("../app/lib/app-settings.ts");
const { workContextHistory } = await import("../app/lib/work-context.ts");
const { startCodeRelease } = await import("../app/lib/code-release.ts");

test("saved blog project survives reload and another device can recover it from history", () => {
  const previous = globalThis.localStorage;
  const previousWindow = globalThis.window;
  globalThis.window = {};
  globalThis.localStorage = { getItem: (key) => key === DEVELOPMENT_MODE_KEY
    ? JSON.stringify({ blog: { enabled: true, project: "iooiblog" }, old: { enabled: true, project: "unknown" } }) : null };
  try {
    assert.deepEqual(loadDevelopmentModePrefs().blog, { enabled: true, project: "iooiblog" });
    assert.equal(loadDevelopmentModePrefs().old.project, "iooi");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  assert.deepEqual(inferDevelopmentModePref([{ role: "assistant", source: "code_task_iooiblog" }]),
    { enabled: true, project: "iooiblog" });
  assert.equal(inferDevelopmentModePref([{ role: "assistant", source: "code_task_iooiblog" },
    { role: "user" }]), undefined);
});

test("source and writing project histories stay isolated from each other, normal chat and the current round", () => {
  const records = [
    { role: "user", content: "private chat" },
    ...["iooi", "summer", "iooiblog", "writing"].map((project) => ({ role: "assistant", content: project, source: `code_task_${project}` })),
    { role: "user", content: "current", source: "code_task_iooiblog", roundId: "current" },
  ];
  for (const project of ["iooi", "summer", "iooiblog", "writing"]) {
    assert.equal(isCodeProject(project), true);
    assert.deepEqual(workContextHistory(records, project, "current").map((message) => message.content), [project]);
  }
  for (const value of [null, "../iooi", "constructor", "IOOIBLOG"]) assert.equal(isCodeProject(value), false);
});

test("source projects can deploy, while writing and unknown projects never spawn a release worker", async () => {
  assert.equal(canDeployCodeProject("iooi"), true);
  assert.equal(canDeployCodeProject("summer"), true);
  assert.equal(canDeployCodeProject("iooiblog"), true);
  assert.equal(canDeployCodeProject("writing"), false);
  await assert.rejects(startCodeRelease("deploy", "writing", "writing-test", "writing-test"), /论文文档/);
  await assert.rejects(startCodeRelease("push", "writing", "writing-test", "writing-test"), /不会推送/);
  await assert.rejects(startCodeRelease("deploy", "../../iooi", "blog-unsupported-test", "blog-unsupported-test"), /未知项目/);
  await assert.rejects(startCodeRelease("push", "../../iooi", "blog-unsupported-test", "blog-unsupported-test"), /未知项目/);
});

test("writing mode is recovered from its own last work turn", () => {
  assert.deepEqual(inferDevelopmentModePref([{ role: "assistant", source: "code_task_writing" }]),
    { enabled: true, project: "writing" });
});
