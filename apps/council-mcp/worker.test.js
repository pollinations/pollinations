import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { TIERS } from "./tiers.js";
import { createWorker } from "./worker.js";

function createHarness(failModels = []) {
    const calls = [];
    const worker = createWorker({
        fetchImpl: async (_url, init) => {
            assert.equal(init.headers.Authorization, "Bearer test-ip-key");
            const body = JSON.parse(init.body);
            calls.push(body);
            assert.ok(init.signal, "calls must carry a timeout signal");
            if (failModels.includes(body.model)) {
                // A failed call can still have been charged.
                return Response.json(
                    { usage: { payg_credits_charged: 0.002 } },
                    { status: 500 },
                );
            }
            return Response.json({
                choices: [
                    { message: { content: `answer from ${body.model}` } },
                ],
                usage: { payg_credits_charged: 0.001 },
            });
        },
    });
    return { calls, env: { INFERENCEPORT_API_KEY: "test-ip-key" }, worker };
}

async function connect(worker, env, responses) {
    const client = new Client(
        { name: "council-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://council.internal"), {
            fetch: async (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const response = await worker.fetch(request, env);
                responses.push(response.clone());
                return response;
            },
        }),
    );
    return client;
}

test("lists the council tool without usage", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        ["council_reason"],
    );
    assert.equal(calls.length, 0);
    assert.equal(
        responses.some((r) => r.headers.has(MCP_USAGE_HEADERS.cost)),
        false,
    );
    await client.close();
});

test("bills reported model credits plus the tier fee", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "council_reason",
        arguments: { problem: "Is 17 prime?" },
    });
    const { members, judge } = TIERS.basic;
    assert.equal(calls.length, members.length + 1);
    assert.equal(calls.at(-1).model, judge);
    assert.match(result.content[0].text, new RegExp(`answer from ${judge}`));
    const response = responses.at(-1);
    // 6 calls x 0.001 credits + 0.10 basic fee
    assert.equal(
        Number(response.headers.get(MCP_USAGE_HEADERS.cost)).toFixed(6),
        "0.106000",
    );
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "inferenceport.council.basic.v1",
    );
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    await client.close();
});

test("a failed member is skipped and the answer is still billed", async () => {
    const { env, worker } = createHarness([TIERS.basic.members[0]]);
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "council_reason",
        arguments: { problem: "x", tier: "basic" },
    });
    assert.match(result.content[0].text, /4\/5 members answered/);
    // 4 good members + judge at 0.001, 1 failed member at 0.002, + 0.10 fee
    assert.equal(
        Number(responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost)).toFixed(6),
        "0.107000",
    );
    await client.close();
});

test("a failed judge bills spent credits without the tier fee", async () => {
    const { env, worker } = createHarness([TIERS.basic.judge]);
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "council_reason",
        arguments: { problem: "x" },
    });
    assert.equal(result.isError, true);
    const response = responses.at(-1);
    assert.equal(
        Number(response.headers.get(MCP_USAGE_HEADERS.cost)).toFixed(6),
        "0.007000",
    );
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "502");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "0");
    await client.close();
});

test("bills charged credits when every member fails", async () => {
    const { env, worker } = createHarness(TIERS.basic.members);
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "council_reason",
        arguments: { problem: "x" },
    });
    assert.equal(result.isError, true);
    // Failed members were still charged 0.002 each.
    assert.equal(
        Number(responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost)).toFixed(6),
        "0.010000",
    );
    await client.close();
});

test("rejects batch requests", async () => {
    const { env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://council.internal/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "[]",
        }),
        env,
    );
    assert.equal(response.status, 400);
});
