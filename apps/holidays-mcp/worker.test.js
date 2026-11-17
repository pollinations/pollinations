import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fetchText } from "./fetch.js";
import worker from "./worker.js";

async function client(options = {}) {
    const connection = new Client({ name: "test", version: "1.0.0" }, options);
    await connection.connect(
        new StreamableHTTPClientTransport(
            new URL("https://holidays.invalid/"),
            {
                fetch: (input, init) => worker.fetch(new Request(input, init)),
                requestInit: {
                    headers: {
                        authorization: "Bearer sk_never_upstream",
                        cookie: "private=1",
                    },
                },
            },
        ),
    );
    return connection;
}

const NEW_YEAR = {
    date: "2026-01-01",
    name: "New Year's Day",
    countryCode: "DE",
    nationalHoliday: true,
    subdivisionCodes: null,
    holidayTypes: ["Public"],
};

const EPIPHANY = {
    date: "2026-01-06",
    name: "Epiphany",
    countryCode: "DE",
    nationalHoliday: false,
    subdivisionCodes: ["DE-BW", "DE-BY"],
    holidayTypes: ["Public"],
};

test("private worker exposes four tools using the MCP transport", async () => {
    const c = await client();
    assert.deepEqual((await c.listTools()).tools.map((t) => t.name).sort(), [
        "available_countries",
        "is_holiday",
        "next_holidays",
        "public_holidays",
    ]);
    await c.close();
    for (const path of ["/health", "/nope"]) {
        assert.equal(
            (await worker.fetch(new Request(`https://holidays.invalid${path}`)))
                .status,
            404,
        );
    }
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});

test("modern MCP clients work without server-side sessions", async () => {
    const c = await client({ versionNegotiation: { mode: "auto" } });
    assert.equal(c.getProtocolEra(), "modern");
    assert.equal((await c.listTools()).tools.length, 4);
    await c.close();
});

test("public_holidays shapes Nager.Date data and never forwards credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.hostname, "date.nager.at");
        assert.equal(url.pathname, "/api/v4/Holidays/DE/2026");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json([NEW_YEAR, EPIPHANY]);
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "public_holidays",
        arguments: { country: "de", year: 2026 },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.content[0].text), {
        country: "DE",
        year: 2026,
        total: 2,
        holidays: [
            {
                date: "2026-01-01",
                weekday: "Thursday",
                name: "New Year's Day",
                types: ["Public"],
                nationwide: true,
                subdivisions: [],
            },
            {
                date: "2026-01-06",
                weekday: "Tuesday",
                name: "Epiphany",
                types: ["Public"],
                nationwide: false,
                subdivisions: ["DE-BW", "DE-BY"],
            },
        ],
    });
});

test("next_holidays caps the list and orders the countdown", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.pathname, "/api/v4/Holidays/RU/Next");
        return Response.json([
            { ...NEW_YEAR, countryCode: "RU" },
            { ...EPIPHANY, countryCode: "RU" },
            { ...EPIPHANY, countryCode: "RU", date: "2027-03-08" },
        ]);
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "next_holidays",
        arguments: { country: "RU", limit: 2 },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.country, "RU");
    assert.equal(payload.total, 2);
    assert.equal(payload.holidays.length, 2);
    const [first, second] = payload.holidays;
    assert.ok(Number.isInteger(first.daysUntil));
    assert.ok(first.daysUntil <= second.daysUntil);
});

test("is_holiday matches holiday dates and reports regular working days", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json([NEW_YEAR, EPIPHANY]),
    );
    const c = await client();
    t.after(() => c.close());
    const holiday = await c.callTool({
        name: "is_holiday",
        arguments: { country: "DE", date: "2026-01-06" },
    });
    assert.notEqual(holiday.isError, true, JSON.stringify(holiday));
    const payload = JSON.parse(holiday.content[0].text);
    assert.equal(payload.isPublicHoliday, true);
    assert.equal(payload.weekday, "Tuesday");
    assert.equal(payload.holiday.name, "Epiphany");
    assert.deepEqual(payload.holiday.subdivisions, ["DE-BW", "DE-BY"]);

    const workingDay = await c.callTool({
        name: "is_holiday",
        arguments: { country: "DE", date: "2026-01-07" },
    });
    const plain = JSON.parse(workingDay.content[0].text);
    assert.equal(plain.isPublicHoliday, false);
    assert.equal(plain.holiday, null);
});

test("available_countries filters by name or exact code", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(new URL(input).pathname, "/api/v4/Countries/Available");
        return Response.json([
            { countryCode: "DE", name: "Germany" },
            { countryCode: "RU", name: "Russia" },
            { countryCode: "GB", name: "United Kingdom" },
        ]);
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "available_countries",
        arguments: { search: "ger" },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.content[0].text), {
        total: 3,
        matches: 1,
        countries: [{ code: "DE", name: "Germany" }],
    });
    const byCode = await c.callTool({
        name: "available_countries",
        arguments: { search: "gb" },
    });
    assert.deepEqual(JSON.parse(byCode.content[0].text).countries, [
        { code: "GB", name: "United Kingdom" },
    ]);
});

test("invalid arguments fail before fetch", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () =>
        assert.fail("must not fetch"),
    );
    const c = await client();
    t.after(() => c.close());
    for (const [name, args] of [
        ["public_holidays", { country: "DEU" }],
        ["public_holidays", { country: "DE", year: 1899 }],
        ["public_holidays", { country: "DE", year: 2201 }],
        ["next_holidays", { country: "D1" }],
        ["next_holidays", { country: "DE", limit: 26 }],
        ["is_holiday", { country: "DE", date: "2026-2-3" }],
        ["is_holiday", { country: "DE", date: "2026-02-30" }],
        ["is_holiday", { country: "DE", date: "1899-01-01" }],
        ["available_countries", { search: " " }],
    ]) {
        const result = await c.callTool({ name, arguments: args });
        assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    }
    assert.equal(fetch.mock.callCount(), 0);
});

test("a stalled source becomes an explicit timeout error", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.mock.method(globalThis, "fetch", (input, init) => {
        assert.equal(new URL(input).hostname, "date.nager.at");
        return new Promise((_, reject) => {
            init.signal.addEventListener("abort", () =>
                reject(init.signal.reason),
            );
        });
    });
    const pending = fetchText(
        "https://date.nager.at/api/v4/Countries/Available",
    );
    t.mock.timers.tick(10_000);
    await assert.rejects(pending, /10 seconds/);
});

test("unknown countries and unsupported years are actionable errors", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/Next"))
            return new Response(null, { status: 404 });
        if (url.pathname.includes("/2020"))
            return Response.json(
                {
                    title: "One or more validation errors occurred.",
                    status: 400,
                    errors: {
                        year: ["The specified year '2020' is not supported."],
                    },
                },
                { status: 400 },
            );
        return new Response(null, { status: 404 });
    });
    const c = await client();
    t.after(() => c.close());
    const unknown = await c.callTool({
        name: "next_holidays",
        arguments: { country: "XX" },
    });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /available_countries/);

    const oldYear = await c.callTool({
        name: "public_holidays",
        arguments: { country: "DE", year: 2020 },
    });
    assert.equal(oldYear.isError, true);
    assert.match(oldYear.content[0].text, /rolling window/);
});

test("an empty year returns no holidays and upstream failures stay tool errors", async (t) => {
    const c = await client();
    t.after(() => c.close());
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        if (url.pathname === "/api/v4/Holidays/AQ/2026")
            return new Response(null, { status: 204 });
        if (url.pathname === "/api/v4/Countries/Available")
            return new Response(null, { status: 500 });
        return new Response(null, { status: 404 });
    });
    const empty = await c.callTool({
        name: "public_holidays",
        arguments: { country: "AQ", year: 2026 },
    });
    assert.notEqual(empty.isError, true, JSON.stringify(empty));
    assert.deepEqual(JSON.parse(empty.content[0].text), {
        country: "AQ",
        year: 2026,
        total: 0,
        holidays: [],
    });

    const broken = await c.callTool({
        name: "available_countries",
        arguments: {},
    });
    assert.equal(broken.isError, true);
    assert.match(broken.content[0].text, /HTTP 500/);
});
