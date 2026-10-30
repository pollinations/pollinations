import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const EXPECTED_TOOLS = ["add_time", "convert_time", "current_time"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "time-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://time-mcp.pollinations.ai"),
        { fetch: localFetch },
    );
    await client.connect(transport);
    return client;
}

async function callTool(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
}

test("serves health without auth and 404s other paths", async () => {
    const health = await worker.fetch(
        new Request("https://time-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.name, "time-mcp");
    assert.equal(body.endpoint, "/");

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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

test("current_time renders the requested zone", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const before = Math.floor(Date.now() / 1000);
    const result = await callTool(client, "current_time", {
        zone: "Europe/Berlin",
    });
    const after = Math.floor(Date.now() / 1000);
    assert.equal(result.zone, "Europe/Berlin");
    assert.ok(result.unixSeconds >= before && result.unixSeconds <= after);
    assert.match(result.utcOffset, /^[+-]\d{2}:\d{2}$/);
    assert.match(
        result.local,
        /^202\d-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
    const instantSeconds = Math.floor(Date.parse(result.instant) / 1000);
    assert.ok(instantSeconds >= before && instantSeconds <= after);
});

test("convert_time applies the right offsets in winter and summer", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());

    const winter = await callTool(client, "convert_time", {
        datetime: "2026-01-15T12:00:00",
        from_zone: "America/New_York",
        to_zone: "Europe/Berlin",
    });
    assert.equal(winter.instant, "2026-01-15T17:00:00.000Z");
    assert.equal(winter.source.local, "2026-01-15T12:00:00-05:00");
    assert.equal(winter.target.local, "2026-01-15T18:00:00+01:00");
    assert.equal(winter.sameDay, true);

    // The US is still on daylight time on Oct 28, the EU is not: 5h apart.
    const autumn = await callTool(client, "convert_time", {
        datetime: "2026-10-28T12:00:00",
        from_zone: "America/New_York",
        to_zone: "Europe/Berlin",
    });
    assert.equal(autumn.source.local, "2026-10-28T12:00:00-04:00");
    assert.equal(autumn.target.local, "2026-10-28T17:00:00+01:00");

    const tokyo = await callTool(client, "convert_time", {
        datetime: "2026-01-15T12:00:00Z",
        to_zone: "Asia/Tokyo",
    });
    assert.equal(tokyo.source.zone, "UTC");
    assert.equal(tokyo.target.local, "2026-01-15T21:00:00+09:00");
    assert.equal(tokyo.target.weekday, "Thursday");
});

test("add_time does absolute arithmetic across a DST change", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());

    // US spring forward is 2026-03-08: +24h from Mar 7 noon EST lands at
    // 13:00 EDT, not noon, because the day only has 23 hours.
    const result = await callTool(client, "add_time", {
        datetime: "2026-03-07T12:00:00",
        zone: "America/New_York",
        amount: 24,
        unit: "hours",
    });
    assert.equal(result.start.local, "2026-03-07T12:00:00-05:00");
    assert.equal(result.end.local, "2026-03-08T13:00:00-04:00");
    assert.equal(result.instant, "2026-03-08T17:00:00.000Z");

    const back = await callTool(client, "add_time", {
        datetime: "2026-03-08T13:00:00-04:00",
        zone: "America/New_York",
        amount: -1,
        unit: "days",
    });
    assert.equal(back.end.local, "2026-03-07T12:00:00-05:00");
});

test("rejects unknown zones and invalid datetimes", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["current_time", { zone: "Mars/Olympus_Mons" }],
        ["convert_time", { datetime: "not-a-date", to_zone: "UTC" }],
        ["convert_time", { datetime: "2026-13-01T00:00:00", to_zone: "UTC" }],
        ["add_time", { datetime: "2026-01-15", amount: 1, unit: "fortnights" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    }
});
