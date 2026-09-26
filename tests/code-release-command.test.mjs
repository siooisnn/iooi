import assert from "node:assert/strict";
import test from "node:test";
import { parseCodeReleaseCommand } from "../app/lib/code-release-command.ts";

test("only standalone explicit commands start a release action", () => {
  assert.equal(parseCodeReleaseCommand("部署吧"), "deploy");
  assert.equal(parseCodeReleaseCommand("推送到 GitHub"), "push");
  assert.equal(parseCodeReleaseCommand("请修改代码，改好就部署"), null);
  assert.equal(parseCodeReleaseCommand("能部署吗？"), null);
});
