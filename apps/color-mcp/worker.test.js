import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["contrast_ratio", "generate_palette", "parse_color"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "color-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://color-mcp.pollinations.ai"),
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
        new Request("https://color-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const unauthorized = await worker.fetch(
        new Request("https://color-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="color-mcp.pollinations.ai"',
    );
    const old = await worker.fetch(
        new Request("https://color-mcp.pollinations.ai/mcp"),
    );
    assert.equal(old.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
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
        new Request("https://color-mcp.pollinations.ai", {
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

test("parse_color normalizes hex, name, rgb, hsl", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const cases = [
        ["#ff0000", "#ff0000"],
        ["red", "#ff0000"],
        ["rgb(0, 128, 0)", "#008000"],
        ["hsl(240, 100%, 50%)", "#0000ff"],
    ];
    for (const [input, expectedHex] of cases) {
        const r = await client.callTool({
            name: "parse_color",
            arguments: { color: input },
        });
        assert.notEqual(r.isError, true, input);
        const p = JSON.parse(r.content[0].text);
        assert.equal(p.hex, expectedHex, input);
    }
});

test("parse_color rejects garbage", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "parse_color",
        arguments: { color: "notacolor" },
    });
    assert.notEqual(r.isError, true);
    assert.match(r.content[0].text, /Could not parse/);
});

test("generate_palette produces requested count", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "generate_palette",
        arguments: { baseColor: "#3366cc", scheme: "complementary", count: 4 },
    });
    assert.notEqual(r.isError, true);
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.palette.length, 4);
    for (const hex of p.palette) assert.match(hex, /^#[0-9a-f]{6}$/);
});

test("contrast_ratio computes WCAG result", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "contrast_ratio",
        arguments: { foreground: "#000000", background: "#ffffff" },
    });
    assert.notEqual(r.isError, true);
    const p = JSON.parse(r.content[0].text);
    assert.ok(p.ratio >= 21);
    assert.equal(p.aaNormal, true);
    assert.equal(p.aaaNormal, true);
});
