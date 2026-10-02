import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";

// The listModels tool entry is [name, description, schema, handler].
const [listModelsName, , listModelsSchema, listModelsHandler] =
    discoveryTools[0];

function mockFetchOnce(responseBody) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        calls.push({ url: String(url) });
        return {
            ok: true,
            status: 200,
            json: async () => responseBody,
        };
    };
    return {
        calls,
        restore: () => {
            globalThis.fetch = originalFetch;
        },
    };
}

function queryParamsOf(url) {
    const parsed = new URL(url);
    return { pathname: parsed.pathname, params: parsed.searchParams };
}

test("listModels forwards every filter to the category route and returns the live body unchanged", async () => {
    const liveBody = { models: [{ name: "openai/gpt-5-nano", agent: false }] };
    const mock = mockFetchOnce(liveBody);
    try {
        const result = await listModelsHandler(
            {
                type: "text",
                query: "gpt",
                capabilities: ["reasoning", "tool_calling"],
                agent: true,
                limit: 5,
                community: false,
            },
            {},
        );
        assert.equal(mock.calls.length, 1);
        const { pathname, params } = queryParamsOf(mock.calls[0].url);
        assert.equal(pathname, "/text/models");
        assert.equal(params.get("query"), "gpt");
        assert.equal(params.get("capabilities"), "reasoning,tool_calling");
        assert.equal(params.get("agent"), "true");
        assert.equal(params.get("limit"), "5");
        assert.equal(params.get("community"), "false");

        // Thin proxy: the response body is the live Gen payload, stringified.
        assert.deepEqual(result, {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(liveBody, null, 2),
                },
            ],
        });
    } finally {
        mock.restore();
    }
});

test("listModels without a type targets the full /models route", async () => {
    const mock = mockFetchOnce([]);
    try {
        await listModelsHandler({ limit: 2 }, {});
        const { pathname, params } = queryParamsOf(mock.calls[0].url);
        assert.equal(pathname, "/models");
        assert.equal(params.get("limit"), "2");
    } finally {
        mock.restore();
    }
});

test("listModels collapses duplicate capabilities before forwarding", async () => {
    const mock = mockFetchOnce([]);
    try {
        await listModelsHandler(
            { capabilities: ["reasoning", "reasoning", "web_search"] },
            {},
        );
        const { params } = queryParamsOf(mock.calls[0].url);
        assert.equal(params.get("capabilities"), "reasoning,web_search");
    } finally {
        mock.restore();
    }
});

test("listModels rejects an unknown model type without touching Gen", async () => {
    const mock = mockFetchOnce([]);
    try {
        await assert.rejects(
            () => listModelsHandler({ type: "realtime" }, {}),
            /Unknown model type: realtime/,
        );
        assert.equal(mock.calls.length, 0);
    } finally {
        mock.restore();
    }
});

test("listModels schema enforces the same bounds as Gen", () => {
    const { query, capabilities, agent, limit, type, community } =
        listModelsSchema;

    assert.equal(type.safeParse("text").success, true);
    assert.equal(type.safeParse("realtime").success, false);
    assert.equal(type.safeParse(undefined).success, true);

    assert.equal(community.safeParse(true).success, true);
    assert.equal(community.safeParse("true").success, false);

    assert.equal(query.safeParse("gpt").success, true);
    assert.equal(query.safeParse("a".repeat(200)).success, true);
    assert.equal(query.safeParse("a".repeat(201)).success, false);

    assert.equal(
        capabilities.safeParse(["reasoning", "tool_calling"]).success,
        true,
    );
    assert.equal(capabilities.safeParse([]).success, true);
    assert.equal(capabilities.safeParse(["unknown_capability"]).success, false);
    assert.equal(
        capabilities.safeParse(Array.from({ length: 11 }, () => "reasoning"))
            .success,
        false,
    );
    assert.equal(capabilities.safeParse("reasoning").success, false);

    assert.equal(agent.safeParse(true).success, true);
    assert.equal(agent.safeParse("true").success, false);

    assert.equal(limit.safeParse(1).success, true);
    assert.equal(limit.safeParse(500).success, true);
    assert.equal(limit.safeParse(0).success, false);
    assert.equal(limit.safeParse(501).success, false);
    assert.equal(limit.safeParse(1.5).success, false);

    const combined = listModelsSchema;
    assert.equal(
        combined.query?.safeParse("gpt")?.success &&
            combined.capabilities?.safeParse(["reasoning"])?.success &&
            combined.agent?.safeParse(true)?.success &&
            combined.limit?.safeParse(3)?.success,
        true,
    );
});

test("discoveryTools exposes listModels as the first tool", () => {
    assert.equal(listModelsName, "listModels");
    assert.equal(typeof listModelsHandler, "function");
});
