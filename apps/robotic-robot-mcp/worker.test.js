import assert from "node:assert/strict";
import test from "node:test";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const TOOL_CALL = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
};

function sse(payload) {
    return new Response(
        `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
        {
            headers: { "Content-Type": "text/event-stream" },
        },
    );
}

function request(payload, headers = {}, path = "/run-js") {
    return new Request(`https://robotic-robot.internal${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload),
    });
}

function createHarness(responsePayload) {
    const calls = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            calls.push({
                url,
                headers: new Headers(init.headers),
                body: await new Response(init.body).json(),
            });
            return sse(responsePayload);
        },
    });
    return { calls, worker };
}

test("proxies discovery without billing or caller credentials", async () => {
    const responsePayload = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "run-js" }, { name: "time" }] },
    };
    const { calls, worker } = createHarness(responsePayload);
    const response = await worker.fetch(
        request(
            { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
            {
                Authorization: "Bearer private",
                Cookie: "session=private",
                "x-pollinations-user-id": "private-user",
                [MCP_USAGE_HEADERS.cost]: "100",
            },
        ),
    );

    assert.equal(response.status, 200);
    assert.equal(calls[0].url, "https://mcp.roboticrobot.xyz/mcp/pollinations");
    assert.equal(calls[0].headers.has("authorization"), false);
    assert.equal(calls[0].headers.has("cookie"), false);
    assert.equal(calls[0].headers.has("x-pollinations-user-id"), false);
    assert.equal(calls[0].headers.has(MCP_USAGE_HEADERS.cost), false);
    assert.equal(response.headers.has(MCP_USAGE_HEADERS.cost), false);
    const body = await response.text();
    assert.match(body, /run-js/);
    assert.doesNotMatch(body, /"time"/);
});

test("bills successful time requests at the flat rate", async () => {
    const { worker } = createHarness({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [{ type: "text", text: '{"utc":"2026-09-04T00:00:00Z"}' }],
        },
    });
    const response = await worker.fetch(
        request(
            {
                ...TOOL_CALL,
                params: { name: "time", arguments: { timezone: "UTC" } },
            },
            {},
            "/time",
        ),
    );

    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.0001");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "time");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "robotic_robot.time.v1",
    );
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "1");
});

test("bills run-js by RAM, execution time, and selected vCPU", async () => {
    const { worker } = createHarness({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        ok: true,
                        sku: { ramMb: 16, cpu: 0.025 },
                        result: "42",
                        durationMs: 2000,
                    }),
                },
            ],
            isError: false,
        },
    });
    const response = await worker.fetch(
        request({
            ...TOOL_CALL,
            params: {
                name: "run-js",
                arguments: { code: "6 * 7", ramMb: 16, cpu: 0.025 },
            },
        }),
    );

    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.002");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "run-js");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "robotic_robot.run_js.0_025_vcpu.v1",
    );
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "32");
});

test("keeps each MCP limited to its own tool", async () => {
    const { calls, worker } = createHarness({});
    const response = await worker.fetch(
        request(
            {
                ...TOOL_CALL,
                params: { name: "run-js", arguments: { code: "6 * 7" } },
            },
            {},
            "/time",
        ),
    );

    assert.equal(response.status, 200);
    assert.equal(calls.length, 0);
    assert.match(await response.text(), /Tool not found/);
});

test("bills the default run-js SKU with millisecond precision", async () => {
    const { worker } = createHarness({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        ok: true,
                        sku: { ramMb: 4, cpu: 0.01 },
                        durationMs: 13,
                    }),
                },
            ],
            isError: false,
        },
    });
    const response = await worker.fetch(
        request({
            ...TOOL_CALL,
            params: { name: "run-js", arguments: { code: "6 * 7" } },
        }),
    );

    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.0000013");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits),
        "0.052",
    );
});

test("bills sandbox runtime when JavaScript execution fails", async () => {
    const { worker } = createHarness({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        ok: false,
                        sku: { ramMb: 4, cpu: 0.01 },
                        error: "expected",
                        durationMs: 100,
                    }),
                },
            ],
            isError: true,
        },
    });
    const response = await worker.fetch(
        request({
            ...TOOL_CALL,
            params: {
                name: "run-js",
                arguments: { code: 'throw new Error("expected")' },
            },
        }),
    );

    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.00001");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "422");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.error), "expected");
});

test("fails closed when a successful run-js response has no duration", async () => {
    const { worker } = createHarness({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [{ type: "text", text: '{"ok":true}' }],
            isError: false,
        },
    });
    const response = await worker.fetch(
        request({
            ...TOOL_CALL,
            params: { name: "run-js", arguments: { code: "6 * 7" } },
        }),
    );

    assert.equal(response.status, 502);
    assert.equal(response.headers.has(MCP_USAGE_HEADERS.cost), false);
    assert.match(await response.text(), /missing runtime usage/);
});

test("rejects JSON-RPC batches", async () => {
    const { calls, worker } = createHarness({});
    const response = await worker.fetch(
        request([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]),
    );

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
});
