import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "cron-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://cron-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${TOKEN}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://cron-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://cron-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="cron-mcp.pollinations.ai"',
    );
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name),
        ["next_cron_runs"],
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name),
        ["next_cron_runs"],
    );
    await legacy.close();
});

test("returns future runs after the exclusive start", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "next_cron_runs",
        arguments: {
            expression: "0 9 * * MON",
            start: "2026-10-19T09:00:00Z",
            count: 2,
        },
    });
    assert.notEqual(result.isError, true);
    const value = JSON.parse(result.content[0].text);
    assert.equal(value.timezone, "UTC");
    assert.deepEqual(value.runs, [
        {
            utc: "2026-10-26T09:00:00.000Z",
            local: "2026-10-26T09:00:00+00:00",
        },
        {
            utc: "2026-11-02T09:00:00.000Z",
            local: "2026-11-02T09:00:00+00:00",
        },
    ]);
});

test("keeps local time across a daylight-saving transition", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "next_cron_runs",
        arguments: {
            expression: "30 9 * * *",
            timezone: "America/New_York",
            start: "2026-03-07T00:00:00Z",
            count: 2,
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text).runs, [
        {
            utc: "2026-03-07T14:30:00.000Z",
            local: "2026-03-07T09:30:00-05:00",
        },
        {
            utc: "2026-03-08T13:30:00.000Z",
            local: "2026-03-08T09:30:00-04:00",
        },
    ]);
});

test("rejects unsupported or invalid inputs", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    for (const arguments_ of [
        { expression: "0 0 9 * * MON" },
        { expression: "not a cron" },
        { expression: "0 9 * * *", timezone: "Mars/Olympus" },
        { expression: "0 9 * * *", start: "tomorrow" },
    ]) {
        const result = await client.callTool({
            name: "next_cron_runs",
            arguments: arguments_,
        });
        assert.equal(result.isError, true);
    }
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://cron-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});
