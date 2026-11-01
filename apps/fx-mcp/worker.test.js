import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["fx_convert", "fx_currencies", "fx_rates"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "fx-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://fx-mcp.pollinations.ai"),
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

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://fx-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://fx-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="fx-mcp.pollinations.ai"',
    );
});

test("lists the expected tools on both protocol eras", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://fx-mcp.pollinations.ai", {
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

test("fx_currencies returns the currency map", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = String(input);
        return Response.json({ EUR: "Euro", INR: "Indian Rupee" });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "fx_currencies",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.equal(requested, "https://api.frankfurter.dev/v1/currencies");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        EUR: "Euro",
        INR: "Indian Rupee",
    });
});

test("fx_rates builds the rates URL and passes the payload through", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = new URL(String(input));
        return Response.json({
            amount: 1,
            base: "USD",
            date: "2024-01-15",
            rates: { INR: 82.9, EUR: 0.92 },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "fx_rates",
        arguments: { base: "USD", symbols: ["INR", "EUR"], date: "2024-01-15" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(
        requested.origin + requested.pathname,
        "https://api.frankfurter.dev/v1/2024-01-15",
    );
    assert.equal(requested.searchParams.get("base"), "USD");
    assert.equal(requested.searchParams.get("symbols"), "INR,EUR");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        base: "USD",
        date: "2024-01-15",
        rates: { INR: 82.9, EUR: 0.92 },
    });
});

test("fx_rates defaults to latest with no filters", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = new URL(String(input));
        return Response.json({
            amount: 1,
            base: "EUR",
            date: "2026-10-30",
            rates: { USD: 1.11 },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({ name: "fx_rates", arguments: {} });
    assert.notEqual(result.isError, true);
    assert.equal(requested.pathname, "/v1/latest");
    assert.equal(requested.searchParams.get("base"), null);
});

test("fx_convert multiplies by the fetched rate", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = new URL(String(input));
        return Response.json({
            amount: 1,
            base: "USD",
            date: "2026-10-30",
            rates: { INR: 88.5 },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "fx_convert",
        arguments: { amount: 25, from: "USD", to: "INR" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(requested.searchParams.get("base"), "USD");
    assert.equal(requested.searchParams.get("symbols"), "INR");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        amount: 25,
        from: "USD",
        to: "INR",
        rate: 88.5,
        converted: 2212.5,
        date: "2026-10-30",
    });
});

test("fx_convert reports a missing quote currency", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            amount: 1,
            base: "USD",
            date: "2026-10-30",
            rates: {},
        }),
    );
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "fx_convert",
        arguments: { amount: 10, from: "USD", to: "XXX" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No USD->XXX rate/);
});

test("maps upstream failures to tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        return new Response("not found", { status: 404 });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "fx_rates",
        arguments: { base: "XXX" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /404/);
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const [tool, args] of [
        ["fx_rates", { base: "usd" }],
        ["fx_rates", { date: "15-01-2024" }],
        ["fx_convert", { amount: -5, from: "USD", to: "INR" }],
        ["fx_convert", { amount: 5, from: "US", to: "INR" }],
    ]) {
        const result = await client.callTool({ name: tool, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
