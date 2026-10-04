import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

const listModels = discoveryTools.find(([name]) => name === "listModels")?.[3];

if (typeof listModels !== "function") {
    throw new Error("listModels tool handler not found");
}

function captureFetch(payload) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    const restore = () => {
        globalThis.fetch = originalFetch;
    };
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return Response.json(payload);
    };
    return { calls, restore };
}

test("listModels forwards query, capabilities, agent and limit to Gen", async (t) => {
    const payload = [
        { name: "a", agent: true, capabilities: ["reasoning"] },
        { name: "b" },
    ];
    const { calls, restore } = captureFetch(payload);
    t.after(restore);

    const result = await listModels(
        {
            type: "text",
            community: false,
            query: "flux schnell",
            capabilities: "tool_calling,reasoning",
            agent: true,
            limit: 5,
        },
        CONTEXT,
    );

    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/text/models");
    assert.equal(url.searchParams.get("community"), "false");
    assert.equal(url.searchParams.get("query"), "flux schnell");
    assert.equal(
        url.searchParams.get("capabilities"),
        "tool_calling,reasoning",
    );
    assert.equal(url.searchParams.get("agent"), "true");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");

    // Thin proxy: the live response is passed through untouched, including an
    // entry the MCP would previously have filtered out client-side.
    assert.deepEqual(result, {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    });
});

test("listModels omits absent filters so the plain registry request is unchanged", async (t) => {
    const { calls, restore } = captureFetch([{ name: "openai/gpt-5-nano" }]);
    t.after(restore);

    const result = await listModels({ type: "image" }, CONTEXT);

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/image/models");
    for (const param of [
        "query",
        "capabilities",
        "agent",
        "limit",
        "community",
    ]) {
        assert.equal(url.searchParams.has(param), false, param);
    }
    assert.deepEqual(result, {
        content: [
            {
                type: "text",
                text: JSON.stringify([{ name: "openai/gpt-5-nano" }], null, 2),
            },
        ],
    });
});

test("listModels serialises boolean filters the gateway understands", async (t) => {
    const { calls, restore } = captureFetch([]);
    t.after(restore);

    await listModels({ type: "all", agent: false, limit: 1 }, CONTEXT);

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/models");
    assert.equal(url.searchParams.get("agent"), "false");
    assert.equal(url.searchParams.get("limit"), "1");
});
