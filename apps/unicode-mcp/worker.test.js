import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { inspect } from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["inspect_unicode"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "unicode-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://unicode-mcp.pollinations.ai"),
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
        new Request("https://unicode-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://unicode-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="unicode-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://unicode-mcp.pollinations.ai/mcp"),
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
        new Request("https://unicode-mcp.pollinations.ai", {
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

test("detects confusable, invisible, and ordinary text", () => {
    const result = inspect("pаypal\u200b");
    assert.equal(result.codePointCount, 7);
    assert.equal(result.isAscii, false);
    assert.equal(result.confusableSkeleton, "paypal");
    assert.deepEqual(
        result.suspicious.map(({ codePoint }) => codePoint),
        ["U+0430", "U+200B"],
    );
});

test("MCP tool returns JSON analysis without requiring model usage", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_unicode",
        arguments: { text: "pаypal\u200b" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(
        JSON.parse(result.content[0].text),
        inspect("pаypal\u200b"),
    );
});

test("reports unchanged ASCII text without false positives", () => {
    assert.deepEqual(inspect("Pollinations").suspicious, []);
    assert.equal(inspect("Pollinations").confusableSkeleton, "Pollinations");
});

test("rejects text over the input limit", () => {
    assert.throws(() => inspect("a".repeat(4001)), /4000/);
});
