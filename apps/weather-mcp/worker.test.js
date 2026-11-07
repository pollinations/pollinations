import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "weather-test", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://weather.internal/"),
            {
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
            },
        ),
    );
    t.after(() => client.close());
    return client;
}

async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
}

test("private deployment has no public routes or preview URLs", () => {
    const config = JSON.parse(
        readFileSync(
            new URL("./wrangler.jsonc", import.meta.url),
            "utf8",
        ).replace(/^\s*\/\/.*$/gm, ""),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});

test("private Worker leaves other routes to Gen", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://weather/mcp"))).status,
        404,
    );
});

for (const modern of [false, true])
    test(`stateless protocol ${modern ? "modern" : "legacy"}: list and call`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            [
                "current_weather",
                "forecast_daily",
                "forecast_hourly",
                "geocode_place",
            ].sort(),
        );
    });

const GEOCODE_RESPONSE = {
    results: [
        {
            name: "Budapest",
            latitude: 47.49835,
            longitude: 19.04045,
            timezone: "Europe/Budapest",
            population: 1741041,
            country: "Hungary",
            admin1: "Budapest",
        },
    ],
};

const FORECAST_RESPONSE = {
    timezone: "Europe/Budapest",
    utc_offset_seconds: 3600,
    current: {
        time: "2026-11-07T03:15",
        temperature_2m: 3.5,
        relative_humidity_2m: 81,
        apparent_temperature: 1.2,
        is_day: 0,
        precipitation: 0,
        weather_code: 2,
        surface_pressure: 1018.4,
        wind_speed_10m: 7.6,
        wind_direction_10m: 140,
        wind_gusts_10m: 18.1,
    },
    daily: {
        time: ["2026-11-07", "2026-11-08"],
        weather_code: [3, 51],
        temperature_2m_max: [10.5, 7.5],
        temperature_2m_min: [3.1, 0.8],
        sunrise: ["2026-11-07T06:31", "2026-11-08T06:32"],
        sunset: ["2026-11-07T16:24", "2026-11-08T16:23"],
        precipitation_sum: [0, 0.4],
        precipitation_probability_max: [10, 60],
        wind_speed_10m_max: [14.2, 11.1],
    },
    hourly: {
        time: ["2026-11-07T02:00", "2026-11-07T03:00", "2026-11-07T04:00"],
        temperature_2m: [3.9, 3.5, 3.3],
        weather_code: [1, 2, 3],
        precipitation: [0, 0, 0.1],
        precipitation_probability: [0, 5, 10],
    },
};

test("weather tools map Open-Meteo data without forwarding caller credentials", async (t) => {
    // 02:30 UTC is 03:30 in Budapest (UTC+1), so hourly starts at 03:00.
    t.mock.method(Date, "now", () => Date.parse("2026-11-07T02:30:00Z"));
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        const target = new URL(url);
        requests.push(target);
        assert.ok(
            target.hostname === "geocoding-api.open-meteo.com" ||
                target.hostname === "api.open-meteo.com",
            target.hostname,
        );
        assert.equal(new Headers(options.headers).get("authorization"), null);
        assert.equal(new Headers(options.headers).get("cookie"), null);
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json(
            target.hostname === "geocoding-api.open-meteo.com"
                ? GEOCODE_RESPONSE
                : FORECAST_RESPONSE,
        );
    });
    const client = await clientFor(t);

    const places = await call(client, "geocode_place", { query: "Budapest" });
    assert.equal(places.length, 1);
    assert.equal(places[0].name, "Budapest");
    assert.equal(places[0].country, "Hungary");
    assert.equal(places[0].latitude, 47.49835);

    const current = await call(client, "current_weather", {
        latitude: 47.4979,
        longitude: 19.0402,
    });
    assert.equal(current.temperatureC, 3.5);
    assert.equal(current.weather, "Partly cloudy");
    assert.equal(current.isDay, false);
    assert.equal(current.timezone, "Europe/Budapest");

    const daily = await call(client, "forecast_daily", {
        latitude: 47.4979,
        longitude: 19.0402,
        days: 2,
    });
    assert.equal(daily.days.length, 2);
    assert.equal(daily.days[0].weather, "Overcast");
    assert.equal(daily.days[1].weather, "Light drizzle");
    assert.equal(daily.days[1].temperatureMaxC, 7.5);

    const hourly = await call(client, "forecast_hourly", {
        latitude: 47.4979,
        longitude: 19.0402,
        hours: 2,
    });
    assert.equal(hourly.hours.length, 2);
    assert.equal(hourly.hours[0].time, "2026-11-07T03:00");
    assert.equal(hourly.hours[0].weather, "Partly cloudy");
    assert.equal(hourly.hours[1].precipitationProbabilityPercent, 10);

    assert.equal(requests.length, 4);
});
