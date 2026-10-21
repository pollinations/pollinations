import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["time_convert", "time_math", "time_now"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "time-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://time-mcp.pollinations.ai"),
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
        new Request("https://time-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://time-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="time-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://time-mcp.pollinations.ai/mcp"),
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
        new Request("https://time-mcp.pollinations.ai", {
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

test("time_now reports the UTC instant and requested zones", async (t) => {
    const FIXED_NOW = Date.UTC(2026, 9, 18, 9, 30, 0, 0);
    t.mock.timers.enable({ now: FIXED_NOW });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "time_now",
        arguments: {
            timezones: ["Asia/Singapore", "America/New_York"],
        },
    });
    assert.notEqual(result.isError, true);
    const body = JSON.parse(result.content[0].text);
    assert.deepEqual(body, {
        utc: {
            iso: "2026-10-18T09:30:00.000Z",
            unixSeconds: Math.floor(FIXED_NOW / 1000),
            unixMillis: FIXED_NOW,
            weekday: "Sunday",
        },
        zones: {
            "Asia/Singapore": {
                iso: "2026-10-18T17:30:00+08:00",
                offset: "+08:00",
                name: "Singapore Standard Time",
            },
            "America/New_York": {
                iso: "2026-10-18T05:30:00-04:00",
                offset: "-04:00",
                name: "Eastern Daylight Time",
            },
        },
    });
});

test("time_now rejects unknown timezones", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "time_now",
        arguments: { timezones: ["Mars/Olympus_Mons"] },
    });
    assert.equal(result.isError, true);
    client.close();
});

test("time_convert reads a wall-clock time in a source timezone", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "time_convert",
        arguments: {
            time: "2026-10-18 09:00",
            from_timezone: "Asia/Singapore",
            to_timezones: ["Europe/Berlin"],
        },
    });
    assert.notEqual(result.isError, true);
    const body = JSON.parse(result.content[0].text);
    assert.deepEqual(body, {
        utc: {
            iso: "2026-10-18T01:00:00.000Z",
            unixSeconds: Math.floor(Date.UTC(2026, 9, 18, 1) / 1000),
        },
        zones: {
            // Berlin is still on CEST (+02:00) on October 18, 2026.
            "Europe/Berlin": {
                iso: "2026-10-18T03:00:00+02:00",
                offset: "+02:00",
                name: "Central European Summer Time",
            },
        },
    });
    client.close();
});

test("time_convert is DST-correct across a spring-forward gap", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "time_convert",
        arguments: {
            // 02:30 does not exist on 2026-03-08 in New York: the clock
            // jumps from 02:00 EST to 03:00 EDT.
            time: "2026-03-08T02:30:00",
            from_timezone: "America/New_York",
            to_timezones: ["America/New_York", "UTC"],
        },
    });
    assert.notEqual(result.isError, true);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.utc.iso, "2026-03-08T07:30:00.000Z");
    assert.equal(
        body.zones["America/New_York"].iso,
        "2026-03-08T03:30:00-04:00",
    );
    client.close();
});

test("time_convert accepts explicit offsets and rejects a double offset", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const clean = await client.callTool({
        name: "time_convert",
        arguments: { time: "2026-10-18T12:00:00+02:00" },
    });
    assert.notEqual(clean.isError, true);
    assert.equal(
        JSON.parse(clean.content[0].text).utc.iso,
        "2026-10-18T10:00:00.000Z",
    );

    const conflicting = await client.callTool({
        name: "time_convert",
        arguments: {
            time: "2026-10-18T12:00:00+02:00",
            from_timezone: "Asia/Singapore",
        },
    });
    assert.equal(conflicting.isError, true);
    client.close();
});

test("time_math adds calendar units with month-end clamping", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const clamp = await client.callTool({
        name: "time_math",
        arguments: { start: "2026-01-31", changes: { months: 1 } },
    });
    assert.notEqual(clamp.isError, true);
    assert.equal(
        JSON.parse(clamp.content[0].text).result,
        "2026-02-28T00:00:00.000Z",
    );

    const combined = await client.callTool({
        name: "time_math",
        arguments: {
            start: "2025-12-31T15:00:00Z",
            changes: { years: 1, months: 2, days: 3, hours: -2 },
        },
    });
    assert.notEqual(combined.isError, true);
    assert.equal(
        JSON.parse(combined.content[0].text).result,
        "2027-03-03T13:00:00.000Z",
    );

    const negative = await client.callTool({
        name: "time_math",
        arguments: { start: "2026-03-31", changes: { months: -1 } },
    });
    assert.equal(
        JSON.parse(negative.content[0].text).result,
        "2026-02-28T00:00:00.000Z",
    );
    client.close();
});

test("time_math measures calendar distances", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const wholeYear = await client.callTool({
        name: "time_math",
        arguments: { start: "2025-10-18", end: "2026-10-18" },
    });
    assert.notEqual(wholeYear.isError, true);
    assert.deepEqual(JSON.parse(wholeYear.content[0].text).duration, {
        sign: 1,
        years: 1,
        months: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalDays: 365,
        totalSeconds: 365 * 86_400,
    });

    const clampedMonth = await client.callTool({
        name: "time_math",
        arguments: { start: "2026-01-31", end: "2026-02-28" },
    });
    assert.deepEqual(JSON.parse(clampedMonth.content[0].text).duration, {
        sign: 1,
        years: 0,
        months: 1,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalDays: 28,
        totalSeconds: 28 * 86_400,
    });

    const reversed = await client.callTool({
        name: "time_math",
        arguments: {
            start: "2026-10-18T09:00:00Z",
            end: "2026-10-17T09:00:00Z",
        },
    });
    assert.equal(JSON.parse(reversed.content[0].text).duration.sign, -1);
    assert.equal(JSON.parse(reversed.content[0].text).duration.days, 1);
    client.close();
});

test("time_math rejects bad requests", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    for (const arguments_ of [
        { start: "2026-01-01" },
        {
            start: "2026-01-01",
            changes: { days: 1 },
            end: "2026-01-02",
        },
        { start: "2026-02-30", changes: { days: 1 } },
        { start: "next tuesday", changes: { days: 1 } },
    ]) {
        const result = await client.callTool({
            name: "time_math",
            arguments: arguments_,
        });
        assert.equal(result.isError, true, JSON.stringify(arguments_));
    }
    client.close();
});
