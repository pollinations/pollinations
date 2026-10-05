import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const listModels = discoveryTools.find(([name]) => name === "listModels")[3];

// Records every request and returns a catalog mixing agents with regular
// models, so a local re-filter would be visible in the tool response.
function recordModelRequests(models) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return Response.json(models);
    };
    return {
        calls,
        restore: () => {
            globalThis.fetch = originalFetch;
        },
    };
}

const CATALOG = [
    { name: "openai", agent: false },
    { name: "community/owner/helper", agent: true },
    { name: "community/other/vision", agent: true },
];

test("forwards every discovery filter to Gen", async (t) => {
    const { calls, restore } = recordModelRequests(CATALOG);
    t.after(restore);

    const response = await listModels(
        {
            type: "text",
            community: false,
            agent: true,
            query: "vision",
            capabilities: "tool_calling,reasoning",
            limit: 2,
        },
        CONTEXT,
    );

    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/text/models");
    assert.deepEqual(
        {
            community: url.searchParams.get("community"),
            agent: url.searchParams.get("agent"),
            query: url.searchParams.get("query"),
            capabilities: url.searchParams.get("capabilities"),
            limit: url.searchParams.get("limit"),
        },
        {
            community: "false",
            agent: "true",
            query: "vision",
            capabilities: "tool_calling,reasoning",
            limit: "2",
        },
    );
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(response, {
        content: [{ type: "text", text: JSON.stringify(CATALOG, null, 2) }],
    });
});

test("omits filters the caller did not set", async (t) => {
    const { calls, restore } = recordModelRequests(CATALOG);
    t.after(restore);

    await listModels({}, CONTEXT);

    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).search, "");
});

test("returns Gen's catalog without re-filtering by agent", async (t) => {
    const { restore } = recordModelRequests(CATALOG);
    t.after(restore);

    for (const agent of [true, false, undefined]) {
        const response = await listModels({ agent }, CONTEXT);
        const returned = JSON.parse(response.content[0].text);
        assert.deepEqual(returned, CATALOG);
    }
});
