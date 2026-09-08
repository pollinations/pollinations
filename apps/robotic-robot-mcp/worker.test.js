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
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            ...headers,
        },
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

test("serves local time for free without an upstream call", async () => {
    const { calls, worker } = createHarness({});
    for (const timezone of [undefined, "Asia/Tokyo"]) {
        const before = Date.now();
        const response = await worker.fetch(
            request(
                {
                    ...TOOL_CALL,
                    params: { name: "time", arguments: { timezone } },
                },
                {},
                "/time",
            ),
        );

        assert.equal(response.status, 200);
        assert.equal(response.headers.has(MCP_USAGE_HEADERS.cost), false);
        const payload = JSON.parse((await response.text()).split("data: ")[1]);
        const result = JSON.parse(payload.result.content[0].text);
        assert.equal(result.timezone, timezone ?? "UTC");
        assert.ok(
            Date.parse(result.utc) >= before &&
                Date.parse(result.utc) <= Date.now(),
        );
        assert.equal(
            result.local,
            new Intl.DateTimeFormat("en-US", {
                timeZone: timezone ?? "UTC",
                dateStyle: "full",
                timeStyle: "long",
            }).format(new Date(result.utc)),
        );
    }
    assert.equal(calls.length, 0);
});

test("local time discovery and invalid timezones stay local", async () => {
    const { calls, worker } = createHarness({});
    const discovery = await worker.fetch(
        request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}, "/time"),
    );
    const catalog = JSON.parse((await discovery.text()).split("data: ")[1]);
    assert.deepEqual(
        catalog.result.tools.map((tool) => tool.name),
        ["time"],
    );
    const response = await worker.fetch(
        request(
            {
                ...TOOL_CALL,
                params: {
                    name: "time",
                    arguments: { timezone: "not-a-timezone" },
                },
            },
            {},
            "/time",
        ),
    );
    const payload = JSON.parse((await response.text()).split("data: ")[1]);
    assert.equal(payload.result.isError, true);
    assert.equal(response.headers.has(MCP_USAGE_HEADERS.cost), false);
    assert.equal(calls.length, 0);
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
    assert.match(await response.text(), /not found/);
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

test("rejects null, string and boolean runtime durations instead of coercing them", async () => {
    for (const durationMs of [null, "0", false]) {
        const { worker } = createHarness({
            result: {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ok: true,
                            durationMs,
                            sku: { ramMb: 4, cpu: 0.01 },
                        }),
                    },
                ],
            },
        });
        const response = await worker.fetch(
            request({
                ...TOOL_CALL,
                params: { name: "run-js", arguments: { code: "1 + 1" } },
            }),
        );
        assert.equal(response.status, 502);
        assert.equal(response.headers.has(MCP_USAGE_HEADERS.cost), false);
    }
});
