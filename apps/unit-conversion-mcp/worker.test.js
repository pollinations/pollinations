import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { convertUnits, UNITS } from "./units.js";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const ORIGIN = "https://unit-conversion-mcp.pollinations.ai";
const closeTo = (actual, expected) =>
    assert.ok(
        Math.abs(actual - expected) <= Math.max(Math.abs(expected), 1) * 1e-12,
        `${actual} differs from ${expected}`,
    );

async function connect(t, modern = false) {
    const client = new Client(
        { name: "unit-conversion-test", version: "0.0.1" },
        {
            capabilities: {},
            ...(modern && { versionNegotiation: { mode: "auto" } }),
        },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(ORIGIN), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
    );
    t.after(() => client.close());
    return client;
}

test("matches reference conversions in all four quantities", () => {
    for (const [quantity, value, from, to, expected] of [
        ["pressure", 1, "bar", "kPa", 100],
        ["pressure", 1, "psi", "Pa", 6894.757293168361],
        ["pressure", 1, "atm", "Pa", 101325],
        ["pressure", 1, "kgf/cm2", "Pa", 98066.5],
        ["volume_flow", 1, "L/min", "m3/h", 0.06],
        ["volume_flow", 1, "US_gal/min", "L/min", 3.785411784],
        ["volume_flow", 1, "imp_gal/min", "L/min", 4.54609],
        ["power", 1, "hp_mechanical", "W", 745.6998715822702],
        ["power", 1, "hp_metric", "W", 735.49875],
        ["energy", 1, "kWh", "MJ", 3.6],
        ["energy", 1, "Btu_IT", "J", 1055.05585262],
        ["energy", -2, "Wh", "J", -7200],
    ])
        closeTo(
            convertUnits({ quantity, value, from, to }).converted,
            expected,
        );
});

test("round trips every supported unit pair and preserves identity and zero", () => {
    for (const [quantity, units] of Object.entries(UNITS)) {
        for (const from of Object.keys(units)) {
            assert.equal(
                convertUnits({ quantity, from, to: from, value: 12.5 })
                    .converted,
                12.5,
            );
            for (const to of Object.keys(units)) {
                const converted = convertUnits({
                    quantity,
                    from,
                    to,
                    value: 12.5,
                }).converted;
                closeTo(
                    convertUnits({
                        quantity,
                        from: to,
                        to: from,
                        value: converted,
                    }).converted,
                    12.5,
                );
                assert.equal(
                    convertUnits({ quantity, from, to, value: 0 }).converted,
                    0,
                );
            }
        }
    }
});

test("rejects incompatible, ambiguous, case-mismatched and inherited unit names", () => {
    for (const from of ["kWh", "BAR", "gpm", "constructor", "__proto__"]) {
        assert.throws(
            () =>
                convertUnits({
                    quantity: "pressure",
                    from,
                    to: "Pa",
                    value: 1,
                }),
            /Unsupported pressure unit/,
        );
    }
    assert.throws(
        () => convertUnits({ quantity: "power", from: "W", to: "J", value: 1 }),
        /Unsupported power unit/,
    );
});

test("rejects non-finite input, overflow and underflow without rounding valid values", () => {
    for (const value of [NaN, Infinity, -Infinity, "1"]) {
        assert.throws(() =>
            convertUnits({ quantity: "energy", from: "J", to: "kWh", value }),
        );
    }
    assert.throws(
        () =>
            convertUnits({
                quantity: "energy",
                from: "MWh",
                to: "J",
                value: Number.MAX_VALUE,
            }),
        /numeric range/,
    );
    assert.throws(
        () =>
            convertUnits({
                quantity: "energy",
                from: "J",
                to: "MWh",
                value: Number.MIN_VALUE,
            }),
        /numeric range/,
    );
    assert.equal(
        convertUnits({
            quantity: "energy",
            from: "MWh",
            to: "MWh",
            value: Number.MAX_VALUE,
        }).converted,
        Number.MAX_VALUE,
    );
});

test("serves health, rejects other routes and requires one bearer token", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).stateless, true);
    assert.equal(
        (await worker.fetch(new Request(`${ORIGIN}/missing`))).status,
        404,
    );
    for (const authorization of ["", "Basic abc", "Bearer", "Bearer one two"]) {
        const response = await worker.fetch(
            new Request(ORIGIN, { headers: { Authorization: authorization } }),
        );
        assert.equal(response.status, 401);
        assert.match(response.headers.get("www-authenticate"), /^Bearer /);
    }
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request(ORIGIN, {
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

test("supports modern and legacy clients without sessions", async (t) => {
    for (const modern of [true, false]) {
        const client = await connect(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map(({ name }) => name).sort(),
            ["convert_units", "list_units"],
        );
        const response = await client.callTool({
            name: "convert_units",
            arguments: { quantity: "energy", value: 2, from: "kWh", to: "MJ" },
        });
        assert.notEqual(response.isError, true);
        closeTo(JSON.parse(response.content[0].text).converted, 7.2);
    }
});

test("lists and converts units without any network or model call", async (t) => {
    t.mock.method(globalThis, "fetch", () => {
        throw new Error("Unexpected outbound request");
    });
    const client = await connect(t, true);
    const all = await client.callTool({ name: "list_units", arguments: {} });
    assert.deepEqual(Object.keys(JSON.parse(all.content[0].text)), [
        "pressure",
        "volume_flow",
        "power",
        "energy",
    ]);
    const filtered = await client.callTool({
        name: "list_units",
        arguments: { quantity: "power" },
    });
    assert.deepEqual(Object.keys(JSON.parse(filtered.content[0].text)), [
        "power",
    ]);
    const response = await client.callTool({
        name: "convert_units",
        arguments: { quantity: "pressure", value: 3, from: "bar", to: "kPa" },
    });
    assert.notEqual(response.isError, true);
    assert.deepEqual(response.structuredContent, {
        quantity: "pressure",
        value: 3,
        from: "bar",
        to: "kPa",
        factor: 100,
        converted: 300,
    });
    assert.equal(JSON.stringify(response).includes(TOKEN), false);
});

test("reports incompatible units and numeric range as tool errors", async (t) => {
    const client = await connect(t, true);
    for (const args of [
        { quantity: "pressure", value: 1, from: "bar", to: "W" },
        { quantity: "energy", value: Number.MAX_VALUE, from: "MWh", to: "J" },
    ]) {
        const response = await client.callTool({
            name: "convert_units",
            arguments: args,
        });
        assert.equal(response.isError, true);
        assert.equal(JSON.stringify(response).includes(TOKEN), false);
    }
});

test("rejects invalid tool arguments before conversion", async (t) => {
    const client = await connect(t, true);
    for (const args of [
        { quantity: "unknown", value: 1, from: "W", to: "kW" },
        { quantity: "power", value: "1", from: "W", to: "kW" },
        { quantity: "power", value: 1, from: "W" },
        { quantity: "power", value: 1, from: "W", to: "kW", extra: true },
    ]) {
        const response = await client.callTool({
            name: "convert_units",
            arguments: args,
        });
        assert.equal(response.isError, true);
    }
});
