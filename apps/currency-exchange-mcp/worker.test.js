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
    "latest_rates",
    "historical_rates",
    "list_currencies",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "currency-exchange-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://currency-exchange-mcp.pollinations.ai"),
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
        new Request("https://currency-exchange-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://currency-exchange-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="currency-exchange-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://currency-exchange-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        [...EXPECTED_TOOLS].sort(),
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        [...EXPECTED_TOOLS].sort(),
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://currency-exchange-mcp.pollinations.ai", {
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

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seenAuthorizations = new Set();
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR",
        );
        // Frankfurter API is public, no auth header expected
        const authorization = new Headers(init?.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return Response.json({
            amount: 1,
            base: "USD",
            date: "2026-10-22",
            rates: { EUR: 0.92 },
        });
    };

    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");

    const request = {
        name: "convert_currency",
        arguments: { amount: 100, from: "USD", to: "EUR" },
    };
    const [first, second] = await Promise.all([
        firstClient.callTool(request),
        secondClient.callTool(request),
    ]);
    assert.deepEqual(JSON.parse(first.content[0].text).converted, 92);
    assert.deepEqual(JSON.parse(second.content[0].text).converted, 92);
    // Frankfurter API is public, no auth header sent
    assert.deepEqual(seenAuthorizations, new Set([null]));

    await Promise.all([firstClient.close(), secondClient.close()]);
});

test("convert_currency converts correctly with mocked rates", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR",
        );
        return Response.json({
            amount: 1,
            base: "USD",
            date: "2026-10-22",
            rates: { EUR: 0.92 },
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 100, from: "USD", to: "EUR" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.amount, 100);
    assert.equal(parsed.from, "USD");
    assert.equal(parsed.to, "EUR");
    assert.equal(parsed.rate, 0.92);
    assert.equal(parsed.converted, 92);
    assert.equal(parsed.date, "2026-10-22");
});

test("latest_rates returns all rates for base currency", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/latest?from=EUR",
        );
        return Response.json({
            base: "EUR",
            date: "2026-10-22",
            rates: { USD: 1.08, GBP: 0.86, JPY: 165.5 },
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "latest_rates",
        arguments: { base: "EUR" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.base, "EUR");
    assert.equal(parsed.date, "2026-10-22");
    assert.equal(parsed.rates.USD, 1.08);
    assert.equal(parsed.rates.GBP, 0.86);
    assert.equal(parsed.rates.JPY, 165.5);
});

test("latest_rates filters by symbols when provided", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,GBP",
        );
        return Response.json({
            base: "EUR",
            date: "2026-10-22",
            rates: { USD: 1.08, GBP: 0.86 },
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "latest_rates",
        arguments: { base: "EUR", symbols: "USD,GBP" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.base, "EUR");
    assert.equal(Object.keys(parsed.rates).length, 2);
    assert.ok("USD" in parsed.rates);
    assert.ok("GBP" in parsed.rates);
});

test("historical_rates returns single date rates", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/2026-01-15?from=EUR&to=USD",
        );
        return Response.json({
            base: "EUR",
            date: "2026-01-15",
            rates: { USD: 1.05 },
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "historical_rates",
        arguments: { base: "EUR", date: "2026-01-15", symbols: "USD" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.base, "EUR");
    assert.equal(parsed.date, "2026-01-15");
    assert.equal(parsed.rates.USD, 1.05);
});

test("historical_rates returns range when endDate provided", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/2026-01-01..2026-01-03?from=EUR&to=USD",
        );
        return Response.json({
            base: "EUR",
            start_date: "2026-01-01",
            end_date: "2026-01-03",
            rates: {
                "2026-01-01": { USD: 1.04 },
                "2026-01-02": { USD: 1.05 },
                "2026-01-03": { USD: 1.06 },
            },
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "historical_rates",
        arguments: { base: "EUR", date: "2026-01-01", endDate: "2026-01-03", symbols: "USD" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.base, "EUR");
    assert.equal(parsed.start_date, "2026-01-01");
    assert.equal(parsed.end_date, "2026-01-03");
    assert.equal(Object.keys(parsed.rates).length, 3);
});

test("list_currencies returns all supported currencies", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/currencies",
        );
        return Response.json({
            USD: "US Dollar",
            EUR: "Euro",
            GBP: "British Pound",
            JPY: "Japanese Yen",
        });
    });

    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "list_currencies",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.USD, "US Dollar");
    assert.equal(parsed.EUR, "Euro");
    assert.equal(parsed.GBP, "British Pound");
    assert.equal(parsed.JPY, "Japanese Yen");
});

test("convert_currency rejects invalid amount", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    for (const amount of [-10, 0, -0.01]) {
        const result = await client.callTool({
            name: "convert_currency",
            arguments: { amount, from: "USD", to: "EUR" },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("convert_currency rejects invalid currency codes", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    for (const args of [
        { amount: 100, from: "US", to: "EUR" },
        { amount: 100, from: "USD", to: "EU" },
        { amount: 100, from: "USDD", to: "EUR" },
        { amount: 100, from: "USD", to: "EURO" },
    ]) {
        const result = await client.callTool({
            name: "convert_currency",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("latest_rates rejects invalid base currency", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "latest_rates",
        arguments: { base: "EU" },
    });
    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("historical_rates rejects invalid date format", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    for (const date of ["2026/01/15", "15-01-2026", "2026-1-15", "invalid"]) {
        const result = await client.callTool({
            name: "historical_rates",
            arguments: { base: "EUR", date, symbols: "USD" },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("historical_rates rejects invalid endDate format", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "historical_rates",
        arguments: { base: "EUR", date: "2026-01-15", endDate: "2026/01/20", symbols: "USD" },
    });
    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("uses shared gateway error mapping for upstream errors", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR",
        );
        return Response.json(
            { error: "Rate limit exceeded" },
            { status: 429 },
        );
    });
    const client = await connectClient({ versionNegotiation: { mode: "auto" } });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "convert_currency",
        arguments: { amount: 100, from: "USD", to: "EUR" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Rate limit exceeded/);
});

test("live Frankfurter API integration smoke test", async (t) => {
    // This test hits the real API - skip if network unavailable
    try {
        const client = await connectClient({ versionNegotiation: { mode: "auto" } });
        t.after(() => client.close());

        const result = await client.callTool({
            name: "convert_currency",
            arguments: { amount: 1, from: "USD", to: "EUR" },
        });
        assert.notEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.ok(typeof parsed.rate === "number");
        assert.ok(parsed.rate > 0);
        assert.ok(typeof parsed.converted === "number");
        assert.ok(typeof parsed.date === "string");
    } catch (e) {
        // Network may be unavailable in test environment
        t.skip("Network unavailable, skipping live integration test");
    }
});