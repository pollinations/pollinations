import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const [, , , listModels] = discoveryTools.find(
    ([name]) => name === "listModels",
);
const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

async function call(t, params, body = [{ name: "openai/gpt-5-nano" }]) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: new URL(String(input)), init });
        return Response.json(body);
    };
    const result = await listModels(params, CONTEXT);
    return { calls, result };
}

test("listModels forwards every filter to the Gen model list", async (t) => {
    const { calls } = await call(t, {
        type: "text",
        query: "gpt nano",
        capabilities: ["reasoning", "tool_calling"],
        agent: false,
        community: false,
        limit: 5,
    });

    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url.pathname, "/text/models");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
        query: "gpt nano",
        capabilities: "reasoning,tool_calling",
        agent: "false",
        community: "false",
        limit: "5",
    });
    assert.equal(init.headers.Authorization, "Bearer sk_test");
});

test("listModels sends no filter parameters when none are given", async (t) => {
    const { calls } = await call(t, {});

    assert.equal(calls[0].url.pathname, "/models");
    assert.equal(calls[0].url.search, "");
});

test("listModels returns the live response without filtering it", async (t) => {
    const body = [{ name: "a", agent: true }, { name: "b" }];
    const { result } = await call(t, { agent: false }, body);

    assert.deepEqual(JSON.parse(result.content[0].text), body);
});
