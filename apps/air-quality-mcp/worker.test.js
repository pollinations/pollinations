import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["air_quality", "air_quality_by_place"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "air-quality-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://air-quality-mcp.pollinations.ai"),
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
        new Request("https://air-quality-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://air-quality-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="air-quality-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://air-quality-mcp.pollinations.ai/mcp"),
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
        new Request("https://air-quality-mcp.pollinations.ai", {
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

const AIR = {
    latitude: 28.875,
    longitude: 78.25,
    timezone: "Asia/Kolkata",
    elevation: 214,
    current: {
        time: "2026-10-22T14:00",
        european_aqi: 47,
        us_aqi: 113,
        pm10: 88.4,
        pm2_5: 41.2,
        carbon_monoxide: 310.5,
        nitrogen_dioxide: 12.3,
        sulphur_dioxide: 2.1,
        ozone: 45.6,
    },
    daily: {
        time: ["2026-10-22", "2026-10-23", "2026-10-24"],
        european_aqi: [47, 52, 38],
        us_aqi: [113, 121, 96],
        pm2_5: [41.2, 45.8, 33.0],
        pm10: [88.4, 95.1, 70.2],
        ozone: [45.6, 47.2, 41.9],
    },
};

test("air quality requests current readings without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://air-quality-api.open-meteo.com");
        assert.equal(url.pathname, "/v1/air-quality");
        assert.equal(url.searchParams.get("latitude"), "28.85");
        assert.equal(url.searchParams.get("longitude"), "78.24");
        assert.equal(
            url.searchParams.get("current"),
            "european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
        );
        assert.equal(url.searchParams.get("forecast_days"), null);
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Open-Meteo",
        );
        return Response.json(AIR);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality",
        arguments: { latitude: 28.85, longitude: 78.24 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.timezone, "Asia/Kolkata");
    assert.equal(report.current.european_aqi, 47);
    assert.equal(report.current.european_aqi_band, "Moderate");
    assert.equal(report.current.us_aqi, 113);
    assert.equal(report.current.us_aqi_band, "Unhealthy for sensitive groups");
    assert.equal(report.current.pm2_5_ugm3, 41.2);
    assert.equal(report.pollen_ugm3, undefined);
    assert.equal(report.daily, undefined);
});

test("air quality includes a daily forecast when days are requested", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("forecast_days"), "3");
        assert.equal(url.searchParams.get("timezone"), "auto");
        assert.match(url.searchParams.get("daily"), /european_aqi/);
        return Response.json(AIR);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality",
        arguments: { latitude: 28.85, longitude: 78.24, days: 3 },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.daily.length, 3);
    assert.deepEqual(
        report.daily.map(({ european_aqi_band }) => european_aqi_band),
        ["Moderate", "Moderate", "Fair"],
    );
    assert.equal(report.daily[1].us_aqi, 121);
});

test("air quality includes pollen counts when requested", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.match(
            url.searchParams.get("current"),
            /alder_pollen,birch_pollen/,
        );
        return Response.json({
            ...AIR,
            current: {
                ...AIR.current,
                alder_pollen: 0,
                birch_pollen: 1.5,
                grass_pollen: 2.5,
                mugwort_pollen: 0,
                olive_pollen: 0,
                ragweed_pollen: 3.25,
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality",
        arguments: { latitude: 48.85, longitude: 2.35, pollen: true },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.current.pollen_ugm3, {
        alder: 0,
        birch: 1.5,
        grass: 2.5,
        mugwort: 0,
        olive: 0,
        ragweed: 3.25,
    });
});

const PLACES = [
    {
        id: 1273294,
        name: "Delhi",
        country: "India",
        admin1: "Delhi",
        latitude: 28.65195,
        longitude: 77.23149,
        timezone: "Asia/Kolkata",
        elevation: 213,
        population: 10927986,
    },
];

test("air_quality_by_place geocodes then queries Open-Meteo", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        const url = new URL(String(input));
        if (url.origin === "https://geocoding-api.open-meteo.com") {
            assert.equal(url.pathname, "/v1/search");
            assert.equal(url.searchParams.get("name"), "Delhi");
            assert.equal(url.searchParams.get("count"), "1");
            return Response.json({ results: PLACES });
        }
        assert.equal(url.origin, "https://air-quality-api.open-meteo.com");
        assert.equal(url.searchParams.get("latitude"), "28.65195");
        assert.equal(url.searchParams.get("longitude"), "77.23149");
        return Response.json(AIR);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality_by_place",
        arguments: { query: "Delhi", days: 2 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 2);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.place.name, "Delhi");
    assert.equal(report.place.country, "India");
    assert.equal(report.air_quality.timezone, "Asia/Kolkata");
    assert.equal(
        report.air_quality.current.us_aqi_band,
        "Unhealthy for sensitive groups",
    );
    assert.equal(report.air_quality.daily.length, 3);
});

test("air_quality_by_place reports an unknown place as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ generationtime_ms: 0.4 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality_by_place",
        arguments: { query: "Nowhereville" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No places found/);
});

test("maps API error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            { error: true, reason: "Latitude must be between -90 and 90." },
            { status: 400 },
        ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "air_quality",
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
    for (const [name, args] of [
        ["air_quality", { latitude: 28.85, longitude: 78.24 }],
        ["air_quality_by_place", { query: "Delhi" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
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
        ["air_quality", { longitude: 78 }],
        ["air_quality", { latitude: 28.85 }],
        ["air_quality", { latitude: 91, longitude: 78 }],
        ["air_quality", { latitude: 28.85, longitude: 78, days: 6 }],
        ["air_quality", { latitude: 28.85, longitude: 78, days: -1 }],
        ["air_quality_by_place", { query: "" }],
        ["air_quality_by_place", { query: "Delhi", days: 6 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
