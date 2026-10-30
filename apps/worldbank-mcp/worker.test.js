import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "get_indicator_data",
    "list_countries",
    "search_indicators",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "worldbank-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://worldbank-mcp.pollinations.ai"),
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

function indicatorResponse() {
    return Response.json([
        {
            page: 1,
            pages: 1,
            per_page: 1000,
            total: 5,
            sourceid: "2",
            indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
        },
        [
            {
                indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
                country: { id: "USA", value: "United States" },
                countryiso3code: "USA",
                date: "2024",
                value: 29_000_000_000_000,
            },
            {
                indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
                country: { id: "USA", value: "United States" },
                countryiso3code: "USA",
                date: "2023",
                value: 27_000_000_000_000,
            },
            {
                indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
                country: { id: "USA", value: "United States" },
                countryiso3code: "USA",
                date: "2022",
                value: null,
            },
            {
                indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
                country: { id: "CHN", value: "China" },
                countryiso3code: "CHN",
                date: "2024",
                value: 18_000_000_000_000,
            },
        ],
    ]);
}

function countriesResponse() {
    return Response.json([
        { page: 1, pages: 1, per_page: 400, total: 3 },
        [
            {
                id: "USA",
                iso2Code: "US",
                name: "United States",
                region: { id: "NAC", value: "North America " },
                incomeLevel: { id: "HIC", value: "High income" },
                capitalCity: "Washington D.C.",
                longitude: "-77.032",
                latitude: "38.8895",
            },
            {
                id: "GBR",
                iso2Code: "GB",
                name: "United Kingdom",
                region: { id: "ECS", value: "Europe & Central Asia " },
                incomeLevel: { id: "HIC", value: "High income" },
                capitalCity: "London",
                longitude: "-0.126236",
                latitude: "51.5002",
            },
            {
                id: "WLD",
                iso2Code: "1W",
                name: "World",
                region: { id: "NA", value: "Aggregates" },
                incomeLevel: { id: "NA", value: "Aggregates" },
                capitalCity: "",
                longitude: "",
                latitude: "",
            },
        ],
    ]);
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://worldbank-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://worldbank-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="worldbank-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://worldbank-mcp.pollinations.ai/mcp"),
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
        new Request("https://worldbank-mcp.pollinations.ai", {
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

test("searches the indicator catalog without a network call", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const byTopic = await client.callTool({
        name: "search_indicators",
        arguments: { topic: "health", limit: 50 },
    });
    const byQuery = await client.callTool({
        name: "search_indicators",
        arguments: { query: "gdp per capita" },
    });

    assert.notEqual(byTopic.isError, true);
    const health = JSON.parse(byTopic.content[0].text);
    assert.equal(
        health.indicators.every((indicator) => indicator.topic === "health"),
        true,
    );
    assert.equal(
        health.indicators.some(
            (indicator) => indicator.code === "SP.DYN.LE00.IN",
        ),
        true,
    );

    const gdp = JSON.parse(byQuery.content[0].text);
    assert.equal(gdp.indicators[0].code, "NY.GDP.PCAP.CD");
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("fetches indicator data for several countries without forwarding the key", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen = { url: new URL(String(input)), init };
        return indicatorResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_indicator_data",
        arguments: {
            indicator: "gdp",
            countries: ["US", "CN"],
            start_year: 2020,
            end_year: 2024,
            limit_per_country: 2,
        },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://api.worldbank.org");
    assert.equal(
        seen.url.pathname,
        "/v2/country/US;CN/indicator/NY.GDP.MKTP.CD",
    );
    assert.equal(seen.url.searchParams.get("date"), "2020:2024");
    assert.equal(seen.url.searchParams.get("format"), "json");
    assert.equal(
        new Headers(seen.init.headers).get("authorization"),
        null,
        "the caller's key must not reach the World Bank",
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.indicator.code, "NY.GDP.MKTP.CD");
    assert.equal(payload.indicator.name, "GDP (current US$)");
    assert.deepEqual(payload.requested_countries, ["US", "CN"]);
    assert.equal(payload.countries.length, 2);
    const usa = payload.countries.find((entry) => entry.country_code === "USA");
    assert.deepEqual(usa.observations, [
        { year: "2024", value: 29_000_000_000_000 },
        { year: "2023", value: 27_000_000_000_000 },
    ]);
});

test("rejects unknown indicator names before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_indicator_data",
        arguments: { indicator: "happiness index" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown indicator/);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("passes through an uncatalogued official indicator code", async (t) => {
    let path;
    t.mock.method(globalThis, "fetch", async (input) => {
        path = new URL(String(input)).pathname;
        return indicatorResponse();
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_indicator_data",
        arguments: { indicator: "SP.POP.0014.TO.ZS", countries: ["US"] },
    });

    assert.notEqual(result.isError, true);
    assert.equal(path, "/v2/country/US/indicator/SP.POP.0014.TO.ZS");
});

test("maps a World Bank validation payload to a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json([
            {
                message: [
                    {
                        id: "120",
                        key: "Invalid value",
                        value: "The provided parameter value is not valid",
                    },
                ],
            },
        ]),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "list_countries",
        arguments: {},
    });

    assert.equal(result.isError, true);
    assert.match(
        result.content[0].text,
        /provided parameter value is not valid/,
    );
});

test("lists and filters countries", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input) => {
        seen = new URL(String(input));
        return countriesResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "list_countries",
        arguments: { query: "united" },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.pathname, "/v2/country");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.total, 2);
    assert.equal(payload.countries[0].iso3, "USA");
    assert.equal(payload.countries[0].region, "North America");
    assert.equal(payload.countries[1].iso2, "GB");
});

test("caps country results at the requested limit", async (t) => {
    t.mock.method(globalThis, "fetch", async () => countriesResponse());
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "list_countries",
        arguments: { limit: 1 },
    });

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.total, 3);
    assert.equal(payload.countries.length, 1);
    assert.equal(payload.countries[0].name, "United States");
});

test("rejects malformed country codes before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_indicator_data",
        arguments: { indicator: "gdp", countries: ["../../etc"] },
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});
