import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["list_languages", "translate"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "translate-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://translate-mcp.pollinations.ai"),
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
        new Request("https://translate-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const unauthorized = await worker.fetch(
        new Request("https://translate-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="translate-mcp.pollinations.ai"',
    );
    const old = await worker.fetch(
        new Request("https://translate-mcp.pollinations.ai/mcp"),
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
        new Request("https://translate-mcp.pollinations.ai", {
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

test("translate calls MyMemory with autodetect", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.match(
            String(input),
            /^https:\/\/api\.mymemory\.translated\.net\/get\?q=Hello%20world&langpair=Autodetect%7Cid/,
        );
        return Response.json({
            responseStatus: 200,
            responseData: {
                translatedText: "Halo dunia",
                match: 0.85,
                detectedLanguage: "en",
            },
            quotaFinished: false,
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "translate",
        arguments: { text: "Hello world", target: "id" },
    });
    assert.equal(calls, 1);
    assert.notEqual(r.isError, true);
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.translatedText, "Halo dunia");
    assert.equal(p.source, "en");
});

test("translate with explicit source builds langpair", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.match(String(input), /langpair=id%7Cen/);
        return Response.json({
            responseStatus: 200,
            responseData: {
                translatedText: "Hello world",
                match: 1.0,
                detectedLanguage: "id",
            },
            quotaFinished: false,
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "translate",
        arguments: { text: "Halo dunia", target: "en", source: "id" },
    });
    assert.notEqual(r.isError, true);
    const p = JSON.parse(r.content[0].text);
    assert.equal(p.target, "en");
});

test("translate rejects unknown language", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "translate",
        arguments: { text: "Hi", target: "klingon" },
    });
    assert.notEqual(r.isError, true);
    assert.match(r.content[0].text, /Unknown target/);
});

test("surfaces API errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ responseStatus: 429, responseDetails: "quota" }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const r = await client.callTool({
        name: "translate",
        arguments: { text: "Hi", target: "id" },
    });
    assert.equal(r.isError, true);
});
