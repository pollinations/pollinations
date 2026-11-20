import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const GEOCODE_JAKARTA = {
    results: [
        {
            name: "Jakarta",
            latitude: -6.21462,
            longitude: 106.84513,
            admin1: "Jakarta Special Capital Region",
            country: "Indonesia",
            timezone: "Asia/Jakarta",
        },
    ],
};

const FORECAST = {
    latitude: -6.22,
    longitude: 106.78,
    timezone: "Asia/Jakarta",
    current: {
        time: "2026-11-20T12:00",
        temperature_2m: 27,
        relative_humidity_2m: 90,
        apparent_temperature: 33.6,
        precipitation: 0.1,
        weather_code: 51,
        wind_speed_10m: 1.2,
        wind_direction_10m: 309,
    },
    daily: {
        time: ["2026-11-20", "2026-11-21", "2026-11-22"],
        weather_code: [51, 3, 0],
        temperature_2m_max: [30, 31, 32],
        temperature_2m_min: [24, 24, 25],
        precipitation_sum: [2.5, 0, 0],
        precipitation_probability_max: [80, 10, null],
    },
};

async function client(options = {}) {
    const connection = new Client({ name: "test", version: "1.0.0" }, options);
    await connection.connect(
        new StreamableHTTPClientTransport(new URL("https://weather.invalid/"), {
            fetch: (input, init) => worker.fetch(new Request(input, init)),
            requestInit: {
                headers: {
                    authorization: "Bearer test",
                    cookie: "session=test",
                },
            },
        }),
    );
    return connection;
}

test("private worker exposes one tool using the MCP transport", async () => {
    const c = await client();
    assert.deepEqual(
        (await c.listTools()).tools.map((t) => t.name),
        ["getWeather"],
    );
    await c.close();
    assert.equal(
        (await worker.fetch(new Request("https://weather.invalid/nope")))
            .status,
        404,
    );
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
    assert.ok(
        config.compatibility_flags.includes("global_fetch_strictly_public"),
    );
});

test("modern MCP clients work without server-side sessions", async () => {
    const c = await client({ versionNegotiation: { mode: "auto" } });
    assert.equal(c.getProtocolEra(), "modern");
    assert.equal((await c.listTools()).tools.length, 1);
    await c.close();
});

test("place name geocodes, then forecasts, with no credentials", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        seen.push(url.href);
        assert.equal(new Headers(init.headers).has("authorization"), false);
        assert.equal(new Headers(init.headers).has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        if (url.hostname === "geocoding-api.open-meteo.com") {
            assert.equal(url.searchParams.get("name"), "Jakarta");
            assert.equal(url.searchParams.get("count"), "1");
            return Response.json(GEOCODE_JAKARTA);
        }
        assert.equal(url.hostname, "api.open-meteo.com");
        assert.equal(url.searchParams.get("latitude"), "-6.21462");
        assert.equal(url.searchParams.get("longitude"), "106.84513");
        assert.equal(url.searchParams.get("forecast_days"), "3");
        assert.equal(url.searchParams.get("temperature_unit"), "celsius");
        assert.equal(url.searchParams.get("timezone"), "auto");
        return Response.json(FORECAST);
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "getWeather",
        arguments: { place: "Jakarta" },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(
        data.place,
        "Jakarta, Jakarta Special Capital Region, Indonesia",
    );
    assert.equal(data.timezone, "Asia/Jakarta");
    assert.equal(data.current.temperature, "27°C");
    assert.equal(data.current.feels_like, "33.6°C");
    assert.equal(data.current.condition, "Light drizzle");
    assert.equal(data.current.wind, "1.2 km/h from 309°");
    assert.equal(data.forecast.length, 3);
    assert.equal(data.forecast[0].condition, "Light drizzle");
    assert.equal(data.forecast[0].high, "30°C");
    assert.equal(data.forecast[0].precipitation_probability, "80%");
    assert.equal(data.forecast[1].condition, "Overcast");
    assert.equal(data.forecast[2].condition, "Clear sky");
    assert.equal(data.forecast[2].precipitation_probability, null);
    assert.equal(seen.length, 2);
});

test("latitude,longitude skips geocoding", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.hostname, "api.open-meteo.com");
        assert.equal(url.searchParams.get("latitude"), "-6.2");
        assert.equal(url.searchParams.get("longitude"), "106.8");
        assert.equal(url.searchParams.get("temperature_unit"), "fahrenheit");
        assert.equal(url.searchParams.get("forecast_days"), "1");
        return Response.json(FORECAST);
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "getWeather",
        arguments: {
            place: "-6.2, 106.8",
            forecast_days: 1,
            temperature_unit: "fahrenheit",
        },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.place, "-6.2, 106.8");
    assert.equal(data.current.temperature, "27°F");
    assert.equal(data.forecast.length, 3);
});

test("unknown place and out-of-range coordinates fail clearly", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.hostname, "geocoding-api.open-meteo.com");
        return Response.json({ results: [] });
    });
    const c = await client();
    t.after(() => c.close());
    const missing = await c.callTool({
        name: "getWeather",
        arguments: { place: "Nowhereville" },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No place found for "Nowhereville"/);
    const badCoords = await c.callTool({
        name: "getWeather",
        arguments: { place: "100, 200" },
    });
    assert.equal(badCoords.isError, true);
    assert.match(badCoords.content[0].text, /out of range/);
});
