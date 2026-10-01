import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const listModelsTool = discoveryTools.find(([name]) => name === "listModels");
const listModels = listModelsTool[3];

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

test("listModels forwards search filters and returns Gen's response unmodified", async (t) => {
    const originalFetch = globalThis.fetch;
    let requestedUrl;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    // Includes a model that a client-side agent filter would have dropped,
    // proving listModels no longer re-filters the response itself.
    const upstreamModels = [
        { name: "official/agent-model", agent: true },
        { name: "official/other-agent", agent: true },
    ];
    globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return Response.json(upstreamModels);
    };

    const result = await listModels(
        {
            type: "text",
            query: "agent",
            capabilities: ["tool_calling", "web_search"],
            community: false,
            agent: true,
            limit: 5,
        },
        CONTEXT,
    );

    const url = new URL(requestedUrl);
    assert.equal(url.pathname, "/text/models");
    assert.equal(url.searchParams.get("query"), "agent");
    assert.equal(
        url.searchParams.get("capabilities"),
        "tool_calling|web_search",
    );
    assert.equal(url.searchParams.get("community"), "false");
    assert.equal(url.searchParams.get("agent"), "true");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.ok(!url.searchParams.has("type"));

    assert.deepEqual(JSON.parse(result.content[0].text), upstreamModels);
});

test("listModels defaults to the all-models path when type is omitted", async (t) => {
    const originalFetch = globalThis.fetch;
    let requestedUrl;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return Response.json([]);
    };

    await listModels({}, CONTEXT);

    assert.equal(new URL(requestedUrl).pathname, "/models");
});
