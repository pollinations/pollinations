import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = [
    "generate_passphrase",
    "generate_password",
    "password_strength",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "password-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://password-mcp.pollinations.ai"),
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
        new Request("https://password-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://password-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="password-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://password-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
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
        new Request("https://password-mcp.pollinations.ai", {
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

test("generate_password returns requested length and count", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "generate_password",
        arguments: { length: 24, count: 3, symbols: false },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.passwords.length, 3);
    for (const p of parsed.passwords) {
        assert.equal(p.length, 24);
        assert.match(p, /^[A-Za-z0-9]+$/);
    }
});

test("generate_password respects ambiguous exclusion", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "generate_password",
        arguments: { length: 40, excludeAmbiguous: true },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.doesNotMatch(parsed.passwords[0], /[0O1lI|]/);
});

test("password_strength rates weak and strong passwords differently", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const weak = await client.callTool({
        name: "password_strength",
        arguments: { password: "abc" },
    });
    const strong = await client.callTool({
        name: "password_strength",
        arguments: { password: "Tr0ub4dor&3X!KqPz#9vLm" },
    });
    const w = JSON.parse(weak.content[0].text);
    const s = JSON.parse(strong.content[0].text);
    assert.ok(w.score < s.score);
    assert.notEqual(w.verdict, s.verdict);
});

test("generate_passphrase returns joined words", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "generate_passphrase",
        arguments: { words: 4, separator: ".", capitalize: false },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.passphrase.split(".").length, 4);
    assert.match(parsed.passphrase, /^[a-z]+(\.[a-z]+){3}$/);
});
