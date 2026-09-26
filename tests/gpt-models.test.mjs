import assert from "node:assert/strict";
import test from "node:test";

import { allowedGptApiId, DEFAULT_GPT_MODEL, GPT_MODELS, resolveGptModel } from "../app/lib/gpt-models.ts";

test("GPT picker offers GPT-5.6 Sol, GPT-6 Sol and GPT-6 Astra", () => {
  assert.deepEqual(
    GPT_MODELS.map((model) => model.apiId),
    ["openai/gpt-5.6-sol", "openai/gpt-6-sol", "openai/gpt-6-astra"],
  );
});

test("existing users keep GPT-5.6 Sol until they pick another model", () => {
  assert.equal(DEFAULT_GPT_MODEL.apiId, "openai/gpt-5.6-sol");
  assert.equal(resolveGptModel(undefined).apiId, "openai/gpt-5.6-sol");
  assert.equal(resolveGptModel("unknown").apiId, "openai/gpt-5.6-sol");
});

test("settings ids and API ids both resolve", () => {
  assert.equal(resolveGptModel("gpt6sol").apiId, "openai/gpt-6-sol");
  assert.equal(resolveGptModel("openai/gpt-6-astra").id, "gpt6astra");
});

test("server only accepts allowlisted API ids", () => {
  assert.equal(allowedGptApiId("openai/gpt-6-astra"), "openai/gpt-6-astra");
  assert.equal(allowedGptApiId("openai/gpt-6-astra-pro"), null);
  assert.equal(allowedGptApiId("claude-sonnet-5"), null);
  assert.equal(allowedGptApiId(undefined), null);
});
