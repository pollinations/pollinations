import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = [
    "get_qibla",
    "prayer_times_by_city",
    "prayer_times_by_coords",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "prayer-times-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://prayer-times-mcp.pollinations.ai"),
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

function timingsResponse(extra = {}) {
    return Response.json({
        code: 200,
        status: "OK",
        data: {
            timings: {
                Fajr: "04:10",
                Sunrise: "05:29",
                Dhuhr: "11:37",
                Asr: "14:48",
                Sunset: "17:45",
                Maghrib: "17:45",
                Isha: "18:56",
                Imsak: "04:00",
            },
            date: {
                gregorian: { date: "21-10-2026", weekday: { en: "Wednesday" } },
                hijri: {
                    date: "09-05-1448",
                    month: { en: "Jumada al-Ula" },
                    year: "1448",
                    holidays: [],
                },
            },
            meta: { method: { name: "KEMENAG" }, timezone: "Asia/Jakarta" },
            ...extra,
        },
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://prayer-times-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://prayer-times-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="prayer-times-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://prayer-times-mcp.pollinations.ai/mcp"),
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
        new Request("https://prayer-times-mcp.pollinations.ai", {
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

test("prayer_times_by_coords calls correct URL and formats timings", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.equal(
            String(input),
            "https://api.aladhan.com/v1/timings/21-10-2026?latitude=-6.2088&longitude=106.8456&method=20",
        );
        return timingsResponse();
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "prayer_times_by_coords",
        arguments: {
            latitude: -6.2088,
            longitude: 106.8456,
            date: "21-10-2026",
        },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.timings.fajr, "04:10");
    assert.equal(parsed.timings.maghrib, "17:45");
    assert.equal(parsed.hijriDate, "09-05-1448");
    assert.equal(parsed.calculationMethod, "KEMENAG");
});

test("prayer_times_by_city calls city endpoint", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.equal(
            String(input),
            "https://api.aladhan.com/v1/timingsByCity?city=Jakarta&country=Indonesia&method=20",
        );
        return timingsResponse();
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "prayer_times_by_city",
        arguments: { city: "Jakarta", country: "Indonesia" },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.timings.dhuhr, "11:37");
});

test("get_qibla returns direction", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.aladhan.com/v1/qibla/-6.2088/106.8456",
        );
        return Response.json({
            code: 200,
            status: "OK",
            data: { direction: 293.04 },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_qibla",
        arguments: { latitude: -6.2088, longitude: 106.8456 },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.qiblaDirectionDegrees, 293.04);
});

test("surfaces API errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ code: 400, status: "BAD_REQUEST" }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_qibla",
        arguments: { latitude: 0, longitude: 0 },
    });
    assert.equal(result.isError, true);
});

test("surfaces HTTP errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("nope", { status: 503 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "prayer_times_by_city",
        arguments: { city: "X", country: "Y" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /503/);
});
