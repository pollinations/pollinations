import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const listModels = discoveryTools.find(([name]) => name === "listModels")[3];
const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

function stubFetch(t, payload) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return Response.json(payload);
    };
    return calls;
}

test("forwards search filters to Gen and returns its response untouched", async (t) => {
    // Gen already filtered these (MCP must not re-filter locally): agent=true
    // is asserted below even though the second entry is not an agent.
    const live = [
        { name: "flux", capabilities: ["tool_calling"], agent: false },
        {
            name: "openai",
            capabilities: ["tool_calling", "reasoning"],
            agent: true,
        },
    ];
    const calls = stubFetch(t, live);

    const result = await listModels(
        {
            type: "image",
            community: false,
            agent: true,
            query: "flux",
            capabilities: ["tool_calling", "reasoning"],
            limit: 3,
        },
        CONTEXT,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    const url = new URL(calls[0].url);
    assert.equal(url.origin, "https://gen.pollinations.ai");
    assert.equal(url.pathname, "/image/models");
    assert.equal(url.searchParams.get("community"), "false");
    assert.equal(url.searchParams.get("agent"), "true");
    assert.equal(url.searchParams.get("query"), "flux");
    assert.equal(
        url.searchParams.get("capabilities"),
        "tool_calling|reasoning",
    );
    assert.equal(url.searchParams.get("limit"), "3");

    // Thin proxy: the live body is passed through, not filtered locally.
    assert.deepEqual(result, {
        content: [{ type: "text", text: JSON.stringify(live, null, 2) }],
    });
});

test("omits filter params that were not requested", async (t) => {
    const calls = stubFetch(t, []);
    await listModels({ type: "all" }, CONTEXT);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/models");
    for (const key of [
        "query",
        "capabilities",
        "agent",
        "limit",
        "community",
    ]) {
        assert.equal(url.searchParams.has(key), false, `unexpected ${key}`);
    }
});
