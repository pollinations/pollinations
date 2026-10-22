import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["convert", "list_units"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "units-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://units-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://units-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const unauthorized = await worker.fetch(
        new Request("https://units-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="units-mcp.pollinations.ai"',
    );
    const old = await worker.fetch(
        new Request("https://units-mcp.pollinations.ai/mcp"),
    );
    assert.equal(old.status, 404);
});

test("serves current and 2025 Streamable HTTP", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://units-mcp.pollinations.ai", {
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

test("convert length miles to km", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 10, from: "mi", to: "km" },
    });
    assert.notEqual(r.isError, true);
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.category, "length");
    assert.ok(Math.abs(p.value - 16.09344) < 0.001);
});

test("convert temperature celsius to fahrenheit", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 100, from: "c", to: "f" },
    });
    const p = JSON.parse(r.content[0].text);
    assert.ok(Math.abs(p.value - 212) < 0.001);
});

test("convert temperature kelvin to celsius", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 300, from: "k", to: "c" },
    });
    const p = JSON.parse(r.content[0].text);
    assert.ok(Math.abs(p.value - 26.85) < 0.01);
});

test("convert data gb to mb", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 2, from: "gb", to: "mb" },
    });
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.value, 2048);
});

test("convert with explicit category hint", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 1, from: "h", to: "min", category: "time" },
    });
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.value, 60);
});

test("rejects unknown unit", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "convert",
        arguments: { value: 1, from: "furlong", to: "m" },
    });
    assert.match(r.content[0].text, /Cannot determine|Unknown unit/);
});

test("list_units returns units", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "list_units",
        arguments: { category: "speed" },
    });
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.category, "speed");
    assert.ok(p.units.includes("km/h"));
});
