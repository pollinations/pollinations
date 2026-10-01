import assert from "node:assert/strict";
import test from "node:test";
import { discoveryTools } from "../src/services/discoveryService.js";
import { getModels } from "../src/utils/models.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

const listModelsTool = discoveryTools.find(([name]) => name === "listModels");
const [, , , listModels] = listModelsTool;

function stubFetch(payload = []) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(payload), { status: 200 });
    };
    return calls;
}

function calledParams(calls) {
    assert.equal(calls.length, 1, "exactly one upstream fetch");
    return new URL(calls[0].url).searchParams;
}

function parseModels(response) {
    return JSON.parse(response.content[0].text);
}

test("forwards every filter to Gen without local filtering", async () => {
    // This upstream entry matches NOTHING requested; a thin proxy must
    // return it verbatim, proving Gen (not the MCP) does the filtering.
    const upstream = [
        { name: "unrelated/model", capabilities: [], agent: true },
    ];
    const calls = stubFetch(upstream);
    const response = await listModels(
        {
            type: "text",
            community: false,
            query: "gpt-6 reasoning",
            capabilities: ["reasoning", "tool_calling"],
            agent: true,
            limit: 5,
        },
        CONTEXT,
    );
    const params = calledParams(calls);
    assert.ok(calls[0].url.includes("/text/models"));
    assert.equal(params.get("query"), "gpt-6 reasoning");
    assert.equal(params.get("capabilities"), "reasoning,tool_calling");
    assert.equal(params.get("agent"), "true");
    assert.equal(params.get("limit"), "5");
    assert.equal(params.get("community"), "false");
    assert.deepEqual(parseModels(response), upstream);
});

test("false booleans are forwarded, omitted filters are absent", async () => {
    const calls = stubFetch([]);
    await listModels({ agent: false, community: false }, CONTEXT);
    const params = calledParams(calls);
    assert.equal(params.get("agent"), "false");
    assert.equal(params.get("community"), "false");
    assert.ok(!params.has("query"));
    assert.ok(!params.has("capabilities"));
    assert.ok(!params.has("limit"));
    assert.ok(calls[0].url.includes("/models"));
});

test("type selects the category route", async () => {
    const calls = stubFetch([]);
    await listModels({ type: "image", query: "flux" }, CONTEXT);
    assert.ok(calls[0].url.includes("/image/models"));
    assert.equal(calledParams(calls).get("query"), "flux");
});

test("the caller's API key is forwarded to Gen", async () => {
    const calls = stubFetch([]);
    await listModels({}, CONTEXT);
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
});

test("unknown type fails before any fetch", async () => {
    const calls = stubFetch([]);
    await assert.rejects(listModels({ type: "bogus" }, CONTEXT));
    assert.equal(calls.length, 0);
});

test("getModels keeps accepting a legacy boolean community argument", async () => {
    for (const legacy of [true, false]) {
        const calls = stubFetch([]);
        await getModels("all", CONTEXT, legacy);
        assert.equal(calledParams(calls).get("community"), String(legacy));
    }
});
