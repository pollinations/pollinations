import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

// Stands in for InferencePort's hosted council MCP.
function createInferencePort(reply) {
    const calls = [];
    const handler = createMcpHandler(
        () => {
            const server = new McpServer(
                { name: "council-of-llms", version: "0.0.1" },
                { capabilities: { tools: {} } },
            );
            server.registerTool(
                "council_reason",
                {
                    inputSchema: z.object({
                        problem: z.string(),
                        tier: z.string(),
                        iteration_rounds: z.number(),
                    }),
                },
                (args) => {
                    calls.push(args);
                    return reply(args);
                },
            );
            return server;
        },
        { legacy: "stateless" },
    );
    const fetchImpl = async (input, init) => {
        const request =
            input instanceof Request ? input : new Request(input, init);
        assert.equal(request.url, "https://api.inferenceport.ai/mcp/council/");
        assert.equal(request.headers.get("authorization"), "Bearer ip-key");
        return handler.fetch(request);
    };
    return { calls, fetchImpl };
}

const run = (billing) => ({
    content: [
        {
            type: "text",
            text: JSON.stringify({
                answer: "17 is prime.",
                council: { tier_name: "Basic Council", models_used: 5 },
                billing,
            }),
        },
    ],
});

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

async function callCouncil(reply, args = { problem: "Is 17 prime?" }) {
    const { calls, fetchImpl } = createInferencePort(reply);
    const worker = createWorker({ fetchImpl });
    const responses = [];
    const client = await connect(
        worker,
        { INFERENCEPORT_API_KEY: "ip-key" },
        responses,
    );
    const result = await client.callTool({
        name: "council_reason",
        arguments: args,
    });
    await client.close();
    return { calls, result, receipt: responses.at(-1).headers };
}

test("lists the council tool without usage", async () => {
    const { fetchImpl } = createInferencePort(() => run({}));
    const worker = createWorker({ fetchImpl });
    const responses = [];
    const client = await connect(worker, {}, responses);
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        ["council_reason"],
    );
    assert.equal(
        responses.some((r) => r.headers.has(MCP_USAGE_HEADERS.cost)),
        false,
    );
    await client.close();
});

test("runs InferencePort's council and bills its reported credits plus the surcharge", async () => {
    const { calls, result, receipt } = await callCouncil(() =>
        run({ model_credits: 0.006, surcharge_credits: 0.1, charged: true }),
    );
    assert.deepEqual(calls, [
        { problem: "Is 17 prime?", tier: "basic", iteration_rounds: 1 },
    ]);
    assert.match(result.content[0].text, /^17 is prime\./);
    assert.equal(
        Number(receipt.get(MCP_USAGE_HEADERS.cost)).toFixed(6),
        "0.106000",
    );
    assert.equal(
        receipt.get(MCP_USAGE_HEADERS.adjustmentId),
        "inferenceport.council.basic.v1",
    );
    assert.equal(receipt.get(MCP_USAGE_HEADERS.adjustmentUnits), "1");
    assert.equal(receipt.get(MCP_USAGE_HEADERS.status), "200");
});

test("passes the tier and rounds through", async () => {
    const { calls, receipt } = await callCouncil(
        () => run({ model_credits: 0.5, surcharge_credits: 2, charged: true }),
        { problem: "x", tier: "ultra", iteration_rounds: 2 },
    );
    assert.deepEqual(calls[0], {
        problem: "x",
        tier: "ultra",
        iteration_rounds: 2,
    });
    assert.equal(Number(receipt.get(MCP_USAGE_HEADERS.cost)), 2.5);
    assert.equal(
        receipt.get(MCP_USAGE_HEADERS.adjustmentId),
        "inferenceport.council.ultra.v1",
    );
});

test("does not bill a surcharge InferencePort did not charge", async () => {
    const { receipt } = await callCouncil(() =>
        run({ model_credits: 0.006, surcharge_credits: 0.1, charged: false }),
    );
    assert.equal(Number(receipt.get(MCP_USAGE_HEADERS.cost)), 0.006);
});

test("fails when InferencePort reports no model credits", async () => {
    const { result, receipt } = await callCouncil(() =>
        run({ surcharge_credits: 0.1, charged: true }),
    );
    assert.equal(result.isError, true);
    assert.equal(receipt.get(MCP_USAGE_HEADERS.cost), "0");
    assert.equal(receipt.get(MCP_USAGE_HEADERS.status), "502");
    assert.equal(receipt.get(MCP_USAGE_HEADERS.adjustmentUnits), "0");
});

test("a council error from InferencePort is not billed", async () => {
    const { result, receipt } = await callCouncil(() => ({
        isError: true,
        content: [{ type: "text", text: "Insufficient credits" }],
    }));
    assert.equal(result.isError, true);
    assert.equal(receipt.get(MCP_USAGE_HEADERS.cost), "0");
    assert.equal(receipt.get(MCP_USAGE_HEADERS.status), "502");
});

test("reports a missing key without calling InferencePort", async () => {
    const { calls, fetchImpl } = createInferencePort(() => run({}));
    const worker = createWorker({ fetchImpl });
    const responses = [];
    const client = await connect(worker, {}, responses);
    const result = await client.callTool({
        name: "council_reason",
        arguments: { problem: "x" },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0);
    assert.equal(responses.at(-1).headers.get(MCP_USAGE_HEADERS.status), "500");
    await client.close();
});

test("rejects batch requests", async () => {
    const worker = createWorker({ fetchImpl: fetch });
    const response = await worker.fetch(
        new Request("https://council.internal/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "[]",
        }),
        {},
    );
    assert.equal(response.status, 400);
});
