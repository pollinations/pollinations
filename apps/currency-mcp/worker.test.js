import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "convert_currency",
    "exchange_rates",
    "list_currencies",
    "rate_history",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "currency-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://currency-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

function toolJson(result) {
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
}

function mockUpstream(t, handler) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init = {}) => {
        calls++;
        // The caller's Pollinations key stays at the proxy layer.
        assert.equal(new Headers(init.headers).get("authorization"), null);
        assert.equal(
            String(input).startsWith("https://api.frankfurter.dev/v1"),
            true,
        );
        return handler(String(input), init);
    });
    return () => calls;
}

test("serves health, requires a bearer token, and rejects batches", async () => {
    const health = await worker.fetch(
        new Request("https://currency-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.endpoint, "/");
    assert.equal(body.upstream, "https://api.frankfurter.dev/v1");

    const unauthorized = await worker.fetch(
        new Request("https://currency-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="currency-mcp.pollinations.ai"',
    );

    const batch = await worker.fetch(
        new Request("https://currency-mcp.pollinations.ai", {
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
    assert.equal(batch.status, 400);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        assert.deepEqual(
            (await client.listTools()).tools.map(({ name }) => name).sort(),
            EXPECTED_TOOLS,
        );
        await client.close();
    }
});

test("converts with the latest published rate", async (t) => {
    const calls = mockUpstream(t, () =>
        Response.json({
            amount: 1,
            base: "USD",
            date: "2026-10-23",
            rates: { IDR: 18108 },
        }),
    );
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 250, from: "usd", to: "idr" },
    });

    assert.deepEqual(toolJson(result), {
        amount: 250,
        from: "USD",
        to: "IDR",
        rate: 18108,
        result: 4527000,
        date: "2026-10-23",
    });
    assert.equal(calls(), 1);
});

test("converts on a given date and returns the date the rate is from", async (t) => {
    const urls = [];
    mockUpstream(t, (url) => {
        urls.push(url);
        return Response.json({
            amount: 1,
            base: "EUR",
            date: "2026-10-20",
            rates: { IDR: 20170.57 },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 10, from: "EUR", to: "IDR", date: "2026-10-20" },
    });

    assert.deepEqual(urls, [
        "https://api.frankfurter.dev/v1/2026-10-20?base=EUR&symbols=IDR",
    ]);
    assert.equal(toolJson(result).result, 201705.7);
});

test("short-circuits a same-currency conversion without calling upstream", async (t) => {
    const calls = mockUpstream(t, () => {
        throw new Error("unexpected upstream call");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 42.5, from: "USD", to: "USD" },
    });

    assert.deepEqual(toolJson(result), {
        amount: 42.5,
        from: "USD",
        to: "USD",
        rate: 1,
        result: 42.5,
        date: null,
    });
    assert.equal(calls(), 0);
});

test("returns a narrowed rate table", async (t) => {
    const urls = [];
    mockUpstream(t, (url) => {
        urls.push(url);
        return Response.json({
            amount: 1,
            base: "EUR",
            date: "2026-10-20",
            rates: { IDR: 20170.57, SGD: 1.4312 },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "exchange_rates",
        arguments: {
            base: "eur",
            symbols: ["idr", "SGD"],
            date: "2026-10-20",
        },
    });

    assert.deepEqual(urls, [
        "https://api.frankfurter.dev/v1/2026-10-20?base=EUR&symbols=IDR%2CSGD",
    ]);
    assert.deepEqual(toolJson(result), {
        base: "EUR",
        date: "2026-10-20",
        rates: { IDR: 20170.57, SGD: 1.4312 },
    });
});

test("summarises a history window with its first, last and change", async (t) => {
    let url;
    mockUpstream(t, (requested) => {
        url = requested;
        return Response.json({
            amount: 1,
            base: "USD",
            start_date: "2026-10-01",
            end_date: "2026-10-02",
            rates: {
                "2026-10-01": { IDR: 17946 },
                "2026-10-02": { IDR: 17950 },
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "rate_history",
        arguments: {
            base: "USD",
            to: "IDR",
            start: "2026-10-01",
            end: "2026-10-03",
        },
    });

    assert.equal(
        url,
        "https://api.frankfurter.dev/v1/2026-10-01..2026-10-03?base=USD&symbols=IDR",
    );
    const body = toolJson(result);
    assert.deepEqual(body.first, { date: "2026-10-01", rate: 17946 });
    assert.deepEqual(body.last, { date: "2026-10-02", rate: 17950 });
    assert.equal(body.change, 4);
    assert.equal(body.changePercent, Number(((4 / 17946) * 100).toFixed(6)));
    assert.equal(body.points.length, 2);
});

test("lists the covered currencies", async (t) => {
    mockUpstream(t, () =>
        Response.json({
            IDR: "Indonesian Rupiah",
            USD: "United States Dollar",
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "list_currencies",
        arguments: {},
    });

    assert.deepEqual(toolJson(result), {
        count: 2,
        currencies: { IDR: "Indonesian Rupiah", USD: "United States Dollar" },
    });
});

test("turns an uncovered currency into a clear tool error", async (t) => {
    mockUpstream(t, () =>
        Response.json({ message: "not found" }, { status: 404 }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 1, from: "USD", to: "VND" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not found/);
    assert.match(result.content[0].text, /list_currencies/);
});

test("rejects malformed input before any upstream call", async (t) => {
    const calls = mockUpstream(t, () => {
        throw new Error("unexpected upstream call");
    });
    const client = await connectClient();
    t.after(() => client.close());

    for (const args of [
        { amount: 1, from: "US", to: "IDR" },
        { amount: 0, from: "USD", to: "IDR" },
        { amount: 1, from: "USD", to: "IDR", date: "20-10-2026" },
    ]) {
        const result = await client.callTool({
            name: "convert_currency",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls(), 0);
});
