import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";
const { fetchStartupData, StartupAuthError, createServerSync } = await import("../app/lib/client-api.ts");

test("startup reads are bounded, cancellable and never replace missing data with empty snapshots", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = [];
  const hangingBody = (_url, init) => {
    calls.push(init);
    return Promise.resolve({ status: 200, ok: true, json: () => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }) });
  };
  try {
    await t.test("successful snapshots preserve all three stores", async () => {
      globalThis.fetch = async (url, init) => {
        assert.equal(init.method, undefined, "startup only reads");
        return Response.json({ sessions: [{ id: url, messages: [{ content: "original" }] }] });
      };
      const data = await fetchStartupData();
      assert.deepEqual(data.map((s) => s.sessions[0].id), ["/api/sync", "/api/gpt/sync", "/api/group/sync"]);
    });
    await t.test("timeout covers downloading and parsing the response body", async () => {
      calls = []; globalThis.fetch = hangingBody;
      await assert.rejects(fetchStartupData(undefined, 20), /超时/);
      assert.equal(calls.length, 3);
      assert.ok(calls.every((c) => c.signal.aborted));
    });
    await t.test("cleanup aborts old requests before a retry", async () => {
      calls = []; globalThis.fetch = hangingBody;
      const controller = new AbortController();
      const pending = fetchStartupData(controller.signal);
      const rejected = assert.rejects(pending, { name: "AbortError" });
      controller.abort();
      await rejected;
      assert.ok(calls.every((c) => c.signal.aborted));
      globalThis.fetch = async () => Response.json({ sessions: [] });
      assert.equal((await fetchStartupData()).length, 3);
    });
    await t.test("authentication failure does not wait for other stuck stores", async () => {
      calls = [];
      globalThis.fetch = (url, init) => url === "/api/sync"
        ? Promise.resolve(new Response("", { status: 401 })) : hangingBody(url, init);
      await assert.rejects(fetchStartupData(undefined, 1000), StartupAuthError);
      assert.ok(calls.every((c) => c.signal.aborted));
    });
    await t.test("HTTP, broken JSON and invalid snapshots fail closed", async () => {
      for (const response of [new Response("", { status: 503 }), new Response("{"), Response.json({ sessions: "broken" })]) {
        globalThis.fetch = async () => response.clone();
        await assert.rejects(fetchStartupData());
      }
      // Other callers retain their established nullable fetch behavior.
      globalThis.fetch = async () => { throw new TypeError("offline"); };
      assert.equal(await createServerSync("/api/test").fetch(), null);
    });
  } finally { globalThis.fetch = originalFetch; }
});
