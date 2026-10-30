import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { resetTickerCache } from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["company_concepts", "find_company", "search_filings"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "sec-edgar-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://sec-edgar-mcp.pollinations.ai"),
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

function tickersResponse() {
    return Response.json({
        0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
        1: { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
        2: { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
    });
}

function revenueConceptResponse() {
    return Response.json({
        cik: 320193,
        taxonomy: "us-gaap",
        tag: "Revenues",
        label: "Revenues",
        description: "Amount of revenue recognized",
        entityName: "Apple Inc.",
        units: {
            USD: [
                {
                    end: "2023-09-30",
                    val: 383285000000,
                    fy: 2023,
                    fp: "FY",
                    form: "10-K",
                    filed: "2023-11-03",
                },
                {
                    end: "2024-09-28",
                    val: 391035000000,
                    fy: 2024,
                    fp: "FY",
                    form: "10-K",
                    filed: "2024-11-01",
                },
                {
                    end: "2022-09-24",
                    val: 394328000000,
                    fy: 2022,
                    fp: "FY",
                    form: "10-K",
                    filed: "2022-10-28",
                },
            ],
        },
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://sec-edgar-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://sec-edgar-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="sec-edgar-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://sec-edgar-mcp.pollinations.ai/mcp"),
    );
    assert.equal(missing.status, 404);
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
        new Request("https://sec-edgar-mcp.pollinations.ai", {
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

test("finds a company by ticker and caches the ticker list", async (t) => {
    resetTickerCache();
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://www.sec.gov");
        assert.equal(url.pathname, "/files/company_tickers.json");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "the caller's key must not reach SEC",
        );
        return tickersResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const first = await client.callTool({
        name: "find_company",
        arguments: { query: "aapl" },
    });
    const second = await client.callTool({
        name: "find_company",
        arguments: { query: "nvidia" },
    });

    assert.notEqual(first.isError, true);
    assert.notEqual(second.isError, true);
    const firstPayload = JSON.parse(first.content[0].text);
    assert.deepEqual(firstPayload.matches[0], {
        ticker: "AAPL",
        name: "Apple Inc.",
        cik: "0000320193",
    });
    assert.equal(JSON.parse(second.content[0].text).matches[0].ticker, "NVDA");
    assert.equal(calls, 1, "the ticker list should be reused");
});

test("searches filings and builds document links", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen = { url: new URL(String(input)), init };
        return Response.json({
            hits: {
                total: { value: 2 },
                hits: [
                    {
                        _id: "0000320193-24-000006:aapl-20231230.htm",
                        _source: {
                            ciks: ["0000320193"],
                            display_names: ["Apple Inc.  (CIK 0000320193)"],
                            form: "10-K",
                            file_date: "2024-11-01",
                            period_ending: "2024-09-28",
                            file_type: "10-K",
                            file_description: "Annual report",
                            adsh: "0000320193-24-000006",
                        },
                    },
                ],
            },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_filings",
        arguments: {
            query: '"material weakness"',
            forms: ["10-K", "10-Q"],
            company: "Apple",
            years: 2,
            limit: 5,
        },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://efts.sec.gov");
    assert.equal(seen.url.pathname, "/LATEST/search-index");
    assert.equal(seen.url.searchParams.get("q"), '"material weakness"');
    assert.equal(seen.url.searchParams.get("forms"), "10-K,10-Q");
    assert.equal(seen.url.searchParams.get("entityName"), "Apple");
    assert.equal(seen.url.searchParams.get("dateRange"), "custom");
    assert.match(seen.url.searchParams.get("startdt"), /^\d{4}-\d{2}-\d{2}$/);

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.total, 2);
    assert.equal(
        payload.filings[0].url,
        "https://www.sec.gov/Archives/edgar/data/320193/000032019324000006/aapl-20231230.htm",
    );
    assert.equal(payload.filings[0].form, "10-K");
});

test("reads financial concepts for a ticker and reports unknown ones", async (t) => {
    resetTickerCache();
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/files/company_tickers.json") {
            return tickersResponse();
        }
        if (url.pathname.endsWith("/Revenues.json")) {
            return revenueConceptResponse();
        }
        return new Response("not found", { status: 404 });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "company_concepts",
        arguments: {
            company: "AAPL",
            concepts: ["Revenues", "NotARealTag"],
            limit: 2,
        },
    });

    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.company.cik, "0000320193");
    assert.equal(payload.concepts.Revenues.unit, "USD");
    assert.equal(payload.concepts.Revenues.values.length, 2);
    assert.equal(payload.concepts.Revenues.values[0].end, "2024-09-28");
    assert.match(payload.errors.NotARealTag, /404/);
});

test("accepts a raw CIK without loading the ticker list", async (t) => {
    resetTickerCache();
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.match(String(input), /CIK0000320193\/us-gaap\/Assets\.json$/);
        return Response.json({
            label: "Assets",
            units: {
                USD: [
                    {
                        end: "2024-09-28",
                        val: 364980000000,
                        fy: 2024,
                        fp: "FY",
                        form: "10-K",
                        filed: "2024-11-01",
                    },
                ],
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "company_concepts",
        arguments: { company: "320193", concepts: ["Assets"] },
    });

    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(JSON.parse(result.content[0].text).company.cik, "0000320193");
});

test("rejects malformed concept names before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "company_concepts",
        arguments: { company: "AAPL", concepts: ["../../etc/passwd"] },
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("maps upstream failures to tool errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("forbidden", { status: 403 }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_filings",
        arguments: { query: "anything" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /SEC full-text search error \(403\)/);
});
