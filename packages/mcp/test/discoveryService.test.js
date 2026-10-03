import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const listModels = discoveryTools.find(([name]) => name === "listModels");

const stubRegistry = (t, models) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        // Returned verbatim on purpose: the tool must not filter locally, so
        // anything the API returns has to reach the caller unchanged.
        return Response.json(models);
    };
    return calls;
};

const call = (params) => listModels[3](params, CONTEXT);

test("forwards every filter to the model registry", async (t) => {
    const models = [{ name: "a" }, { name: "b" }];
    const calls = stubRegistry(t, models);

    const result = await call({
        query: "flux",
        capabilities: ["tool_calling", "reasoning"],
        agent: false,
        community: true,
        limit: 1,
    });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/models");
    assert.equal(url.searchParams.get("query"), "flux");
    assert.equal(
        url.searchParams.get("capabilities"),
        "tool_calling|reasoning",
    );
    assert.equal(url.searchParams.get("agent"), "false");
    assert.equal(url.searchParams.get("community"), "true");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(JSON.parse(result.content[0].text), models);
});

test("omits filters that were not supplied", async (t) => {
    const calls = stubRegistry(t, [{ name: "a" }]);

    await call({ type: "all" });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/models");
    for (const key of [
        "query",
        "capabilities",
        "agent",
        "community",
        "limit",
        "type",
    ]) {
        assert.equal(url.searchParams.has(key), false, key);
    }
});

test("routes the type parameter to its category list", async (t) => {
    const calls = stubRegistry(t, []);

    await call({ type: "image", query: "fox" });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/image/models");
    assert.equal(url.searchParams.get("query"), "fox");
});
