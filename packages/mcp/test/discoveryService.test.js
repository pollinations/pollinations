import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

function findTool(name) {
    const tool = discoveryTools.find(([n]) => n === name);
    assert.ok(tool, `tool ${name} not found`);
    return tool;
}

test("listModels forwards query, capabilities, agent and limit to Gen", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/models")) {
            return Response.json([
                {
                    name: "openai",
                    aliases: ["openai/gpt-4o"],
                    capabilities: ["tool_calling", "reasoning"],
                },
                { name: "flux", aliases: [], capabilities: ["image"] },
            ]);
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const [, , , handler] = findTool("listModels");
    const params = {
        type: "all",
        query: "openai gpt",
        capabilities: ["tool_calling", "reasoning"],
        agent: false,
        limit: 10,
    };
    const result = await handler(params, CONTEXT);
    assert.equal(calls.length, 1);
    const url = calls[0].url;
    assert.ok(
        url.includes("query=openai+gpt") || url.includes("query=openai%20gpt"),
        `query not forwarded: ${url}`,
    );
    assert.ok(
        url.includes("capabilities=tool_calling") ||
            url.includes("capabilities=tool_calling%2Creasoning"),
        `capabilities not forwarded: ${url}`,
    );
    assert.ok(url.includes("agent=false"), `agent not forwarded: ${url}`);
    assert.ok(url.includes("limit=10"), `limit not forwarded: ${url}`);
    assert.ok(result.content[0].text.includes("openai"));
});

test("listModels drops empty capabilities array but keeps false booleans", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/models")) {
            return Response.json([]);
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const [, , , handler] = findTool("listModels");
    const params = {
        type: "all",
        capabilities: [],
        agent: false,
        community: false,
    };
    await handler(params, CONTEXT);
    const url = calls[0].url;
    assert.ok(
        !url.includes("capabilities"),
        `empty capabilities should be dropped: ${url}`,
    );
    assert.ok(
        url.includes("agent=false"),
        `agent=false must be forwarded: ${url}`,
    );
    assert.ok(
        url.includes("community=false"),
        `community=false must be forwarded: ${url}`,
    );
});

test("listModels backward compatibility: boolean third argument means community", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/models")) {
            return Response.json([]);
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const { getModels } = await import("../src/utils/models.js");
    // Direct call with boolean (legacy signature)
    await getModels("all", CONTEXT, true);
    assert.ok(
        calls[0].url.includes("community=true"),
        `boolean true should become community=true: ${calls[0].url}`,
    );
    calls.length = 0;
    await getModels("all", CONTEXT, false);
    assert.ok(
        calls[0].url.includes("community=false"),
        `boolean false should become community=false: ${calls[0].url}`,
    );
});
