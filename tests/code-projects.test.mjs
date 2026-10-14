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

test("three project histories stay isolated from each other, normal chat and the current round", () => {
  const records = [
    { role: "user", content: "private chat" },
    ...["iooi", "summer", "iooiblog"].map((project) => ({ role: "assistant", content: project, source: `code_task_${project}` })),
    { role: "user", content: "current", source: "code_task_iooiblog", roundId: "current" },
  ];
  for (const project of ["iooi", "summer", "iooiblog"]) {
    assert.equal(isCodeProject(project), true);
    assert.deepEqual(workContextHistory(records, project, "current").map((message) => message.content), [project]);
  }
  for (const value of [null, "../iooi", "constructor", "IOOIBLOG"]) assert.equal(isCodeProject(value), false);
});

test("all registered projects can deploy, while unknown projects are rejected before spawning a worker", async () => {
  assert.equal(canDeployCodeProject("iooi"), true);
  assert.equal(canDeployCodeProject("summer"), true);
  assert.equal(canDeployCodeProject("iooiblog"), true);
  await assert.rejects(startCodeRelease("deploy", "../../iooi", "blog-unsupported-test", "blog-unsupported-test"), /未知项目/);
});
