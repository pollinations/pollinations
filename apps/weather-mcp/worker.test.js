import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["geocode", "weather"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "weather-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://weather-mcp.pollinations.ai"),
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
        new Request("https://weather-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://weather-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="weather-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://weather-mcp.pollinations.ai/mcp"),
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
        new Request("https://weather-mcp.pollinations.ai", {
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

const PLACES = [
    {
        id: 1270486,
        name: "Gajraula",
        country: "India",
        admin1: "Uttar Pradesh",
        latitude: 28.84715,
        longitude: 78.23838,
        timezone: "Asia/Kolkata",
        elevation: 214,
        population: 55015,
    },
];

test("geocode queries Open-Meteo without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://geocoding-api.open-meteo.com");
        assert.equal(url.pathname, "/v1/search");
        assert.equal(url.searchParams.get("name"), "Gajraula");
        assert.equal(url.searchParams.get("count"), "5");
        assert.equal(url.searchParams.get("language"), "en");
        assert.equal(url.searchParams.get("format"), "json");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Open-Meteo",
        );
        return Response.json({ results: PLACES });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Gajraula" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text), PLACES);
});

test("geocode reports an empty search as a message", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ generationtime_ms: 0.5 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Nowhereville" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /No places found/);
});

const FORECAST = {
    latitude: 28.875,
    longitude: 78.25,
    timezone: "Asia/Kolkata",
    elevation: 210,
    current_units: {
        time: "iso8601",
        interval: "seconds",
        temperature_2m: "°C",
        relative_humidity_2m: "%",
        apparent_temperature: "°C",
        weather_code: "wmo code",
        wind_speed_10m: "km/h",
    },
    current: {
        time: "2026-10-16T14:30",
        temperature_2m: 28.4,
        relative_humidity_2m: 71,
        apparent_temperature: 31.2,
        weather_code: 2,
        wind_speed_10m: 9.6,
    },
    daily_units: {
        temperature_2m_max: "°C",
        temperature_2m_min: "°C",
        precipitation_sum: "mm",
        precipitation_probability_max: "%",
        wind_speed_10m_max: "km/h",
    },
    daily: {
        time: ["2026-10-16", "2026-10-17", "2026-10-18"],
        weather_code: [2, 61, 95],
        temperature_2m_max: [31.5, 29.8, 28.1],
        temperature_2m_min: [19.2, 20.4, 20.9],
        precipitation_sum: [0, 4.2, 11.7],
        precipitation_probability_max: [10, 80, 95],
        wind_speed_10m_max: [14.1, 18.3, 22.5],
    },
};

test("weather requests current conditions and daily forecast", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://api.open-meteo.com");
        assert.equal(url.pathname, "/v1/forecast");
        assert.equal(url.searchParams.get("latitude"), "28.85");
        assert.equal(url.searchParams.get("longitude"), "78.24");
        assert.equal(url.searchParams.get("forecast_days"), "3");
        assert.equal(url.searchParams.get("timezone"), "auto");
        assert.match(url.searchParams.get("current"), /temperature_2m/);
        assert.match(url.searchParams.get("daily"), /weather_code/);
        return Response.json(FORECAST);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "weather",
        arguments: { latitude: 28.85, longitude: 78.24 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.timezone, "Asia/Kolkata");
    assert.equal(report.current.conditions, "Partly cloudy");
    assert.equal(report.current.temperature, "28.4°C");
    assert.equal(report.current.humidity, "71%");
    assert.equal(report.daily.length, 3);
    assert.deepEqual(
        report.daily.map(({ conditions }) => conditions),
        ["Partly cloudy", "Slight rain", "Thunderstorm"],
    );
    assert.equal(report.daily[1].precipitation_probability, "80%");
});

test("weather maps API error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            { error: true, reason: "Latitude must be between -90 and 90." },
            { status: 400 },
        ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "weather",
        arguments: { latitude: 28.85, longitude: 78.24 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Latitude must be between/);
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const name of ["geocode", "weather"]) {
        const result = await client.callTool({
            name,
            arguments:
                name === "geocode"
                    ? { query: "Delhi" }
                    : { latitude: 28.85, longitude: 78.24 },
        });
        assert.equal(result.isError, true);
    }
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const [name, args] of [
        ["geocode", { query: "" }],
        ["geocode", { query: "Delhi", count: 0 }],
        ["geocode", { query: "Delhi", count: 11 }],
        ["weather", { longitude: 78 }],
        ["weather", { latitude: 28.85 }],
        ["weather", { latitude: 91, longitude: 78 }],
        ["weather", { latitude: 28.85, longitude: 78, days: 8 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
