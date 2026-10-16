import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["currency_convert", "currency_list", "currency_rates"];
const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "currency-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://currency-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers Frankfurter requests from `routes` and records what was asked. */
function mockFrankfurter(routes) {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({ url, headers: new Headers(init?.headers) });
        const answer = routes(url);
        return answer === null
            ? Response.json({ message: "not found" }, { status: 404 })
            : typeof answer === "number"
              ? new Response("error", { status: answer })
              : Response.json(answer);
    };
    return requests;
}

const textOf = (result) => result.content[0].text;

/** Calls a tool and folds protocol-level validation errors into isError. */
const call = (client, name, args) =>
    client
        .callTool({ name, arguments: args })
        .catch((error) => ({ isError: true, error }));

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://currency-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

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

    const oldEndpoint = await worker.fetch(
        new Request("https://currency-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
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
    assert.equal(response.status, 400);
});

test("converts an amount with the latest rate and never sends the caller's key", async () => {
    const requests = mockFrankfurter(() => ({
        amount: 1,
        base: "USD",
        date: "2026-10-16",
        rates: { EUR: 0.88865 },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "currency_convert",
        arguments: { amount: 250, from: "USD", to: "EUR" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), {
        amount: 250,
        from: "USD",
        to: "EUR",
        rate: 0.88865,
        converted: 222.1625,
        date: "2026-10-16",
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.host, "api.frankfurter.dev");
    assert.equal(requests[0].url.pathname, "/v1/latest");
    assert.equal(requests[0].url.searchParams.get("base"), "USD");
    assert.equal(requests[0].url.searchParams.get("symbols"), "EUR");
    assert.match(requests[0].headers.get("user-agent"), /^currency-mcp\//);
    assert.equal(requests[0].headers.get("authorization"), null);
});

test("reports the working day the ECB rate actually comes from", async () => {
    // 2026-10-10 is a Saturday; Frankfurter answers with Friday 2026-10-09.
    const requests = mockFrankfurter(() => ({
        amount: 1,
        base: "USD",
        date: "2026-10-09",
        rates: { EUR: 0.89238 },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "currency_convert",
        arguments: { amount: 100, from: "USD", to: "EUR", date: "2026-10-10" },
    });
    await client.close();

    assert.equal(requests[0].url.pathname, "/v1/2026-10-10");
    const converted = JSON.parse(textOf(result));
    assert.equal(converted.date, "2026-10-09");
    assert.equal(converted.requested_date, "2026-10-10");
    assert.equal(converted.converted, 89.238);
});

test("returns latest, dated and time-series rates", async () => {
    const requests = mockFrankfurter((url) =>
        url.pathname.includes("..")
            ? {
                  amount: 1,
                  base: "EUR",
                  start_date: "2026-10-09",
                  end_date: "2026-10-12",
                  rates: {
                      "2026-10-09": { USD: 1.1206 },
                      "2026-10-12": { USD: 1.1181 },
                  },
              }
            : {
                  amount: 1,
                  base: "EUR",
                  date: "2026-10-09",
                  rates: { USD: 1.1206, GBP: 0.85 },
              },
    );
    const client = await connectClient();

    const latest = await client.callTool({
        name: "currency_rates",
        arguments: {},
    });
    assert.deepEqual(JSON.parse(textOf(latest)), {
        base: "EUR",
        date: "2026-10-09",
        rates: { USD: 1.1206, GBP: 0.85 },
    });
    assert.equal(requests[0].url.pathname, "/v1/latest");
    assert.equal(requests[0].url.searchParams.get("base"), "EUR");
    assert.equal(requests[0].url.searchParams.get("symbols"), null);

    await client.callTool({
        name: "currency_rates",
        arguments: { base: "USD", symbols: ["EUR", "GBP"], date: "2026-10-10" },
    });
    assert.equal(requests[1].url.pathname, "/v1/2026-10-10");
    assert.equal(requests[1].url.searchParams.get("base"), "USD");
    assert.equal(requests[1].url.searchParams.get("symbols"), "EUR,GBP");

    const series = await client.callTool({
        name: "currency_rates",
        arguments: {
            symbols: ["USD"],
            start: "2026-10-10",
            end: "2026-10-12",
        },
    });
    await client.close();
    assert.equal(requests[2].url.pathname, "/v1/2026-10-10..2026-10-12");
    assert.deepEqual(JSON.parse(textOf(series)), {
        base: "EUR",
        start_date: "2026-10-09",
        end_date: "2026-10-12",
        rates: {
            "2026-10-09": { USD: 1.1206 },
            "2026-10-12": { USD: 1.1181 },
        },
    });
});

test("lists currencies as code to name", async () => {
    const requests = mockFrankfurter(() => ({
        EUR: "Euro",
        USD: "United States Dollar",
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "currency_list",
        arguments: {},
    });
    await client.close();
    assert.deepEqual(JSON.parse(textOf(result)), {
        EUR: "Euro",
        USD: "United States Dollar",
    });
    assert.equal(requests[0].url.pathname, "/v1/currencies");
});

test("rejects bad codes, amounts and dates before any upstream call", async () => {
    const requests = mockFrankfurter(() => ({}));
    const client = await connectClient();
    const good = { amount: 1, from: "USD", to: "EUR" };
    const bad = [
        { ...good, from: "usd" },
        { ...good, from: "US" },
        { ...good, to: "EURO" },
        { ...good, from: "../latest" },
        { ...good, to: "EUR&base=XXX" },
        { ...good, amount: 0 },
        { ...good, amount: -5 },
        { ...good, amount: "10" },
        { ...good, date: "10/10/2026" },
        { ...good, date: "2026-02-30" },
        { ...good, date: "2026-10-10/../x" },
        { ...good, to: "USD" },
    ];
    for (const args of bad) {
        const result = await call(client, "currency_convert", args);
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    for (const args of [
        { base: "eur" },
        { symbols: ["USD", "x/y"] },
        { symbols: [] },
        { date: "2026-13-01" },
    ]) {
        const result = await call(client, "currency_rates", args);
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("caps a time series at 366 days and checks its arguments", async () => {
    const requests = mockFrankfurter(() => ({
        amount: 1,
        base: "EUR",
        start_date: "2025-01-01",
        end_date: "2026-01-02",
        rates: {},
    }));
    const client = await connectClient();
    const symbols = ["USD"];

    for (const args of [
        { symbols, start: "2025-01-01", end: "2026-01-03" }, // 367 days
        { symbols, start: "2026-02-01", end: "2026-01-01" },
        { symbols, start: "2026-01-01" },
        { symbols, end: "2026-01-01" },
        { symbols, date: "2026-01-01", start: "2025-12-01", end: "2026-01-01" },
        { start: "2026-01-01", end: "2026-01-31" }, // no symbols
    ]) {
        const result = await call(client, "currency_rates", args);
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    assert.equal(requests.length, 0);

    const edge = await call(client, "currency_rates", {
        symbols,
        start: "2025-01-01",
        end: "2026-01-02", // exactly 366 days
    });
    await client.close();
    assert.equal(edge.isError, undefined);
    assert.equal(requests.length, 1);
});

test("turns an unknown currency or out-of-range date into a tool error", async () => {
    mockFrankfurter(() => null);
    const client = await connectClient();
    const unknown = await client.callTool({
        name: "currency_convert",
        arguments: { amount: 1, from: "USD", to: "ZZZ" },
    });
    const early = await client.callTool({
        name: "currency_rates",
        arguments: { date: "1990-01-01" },
    });
    await client.close();
    assert.equal(unknown.isError, true);
    assert.match(textOf(unknown), /unknown currency code/);
    assert.equal(early.isError, true);
});

test("turns a Frankfurter outage into a tool error", async () => {
    mockFrankfurter(() => 503);
    const client = await connectClient();
    for (const [name, args] of [
        ["currency_convert", { amount: 1, from: "USD", to: "EUR" }],
        ["currency_rates", {}],
        ["currency_list", {}],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, name);
        assert.match(textOf(result), /503/);
    }
    await client.close();
});
