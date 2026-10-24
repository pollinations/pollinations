import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { chunkText, formatDigest } from "./digest.js";
import worker from "./worker.js";

const TOKEN = "sk_test_digest_scoped";
const EXPECTED_TOOLS = ["digest_text", "read_url"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "digest-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://digest-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

function chatResponse(content) {
    return Response.json({
        choices: [
            { message: { role: "assistant", content }, finish_reason: "stop" },
        ],
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://digest-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://digest-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="digest-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://digest-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("lists exactly the two digest tools", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
});

test("read_url returns readable text without markup", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://example.com/story");
        return new Response(
            `<html><head><style>body{color:red}</style><script>track()</script></head>
             <body><h1>Title</h1><p>First &amp; foremost.</p><div>Second line</div></body></html>`,
            { headers: { "content-type": "text/html" } },
        );
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "read_url",
        arguments: { url: "https://example.com/story" },
    });
    assert.notEqual(result.isError, true);
    const text = result.content[0].text;
    assert.match(text, /Title/);
    assert.match(text, /First & foremost\./);
    assert.match(text, /Second line/);
    assert.doesNotMatch(text, /<p>|track\(\)|color:red/);
});

test("read_url reports a failed fetch instead of hanging", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("nope", { status: 403 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "read_url",
        arguments: { url: "https://example.com/private" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /HTTP 403/);
});

test("digest_text summarises every chunk in order", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        const body = JSON.parse(init.body);
        seen.push(body);
        return chatResponse(`summary ${seen.length}`);
    });
    const client = await connectClient();
    t.after(() => client.close());
    // Three paragraphs of ~10k characters each, so the 12k soft limit splits
    // this into exactly three parts.
    const paragraph = (word) => `${word} `.repeat(2000).trim();
    const long = [
        paragraph("alpha"),
        paragraph("beta"),
        paragraph("gamma"),
    ].join("\n\n");
    const result = await client.callTool({
        name: "digest_text",
        arguments: { text: long, model: "openai/gpt-5.4-nano" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(seen.length, 3);
    assert.ok(seen.every((body) => body.model === "openai/gpt-5.4-nano"));
    const text = result.content[0].text;
    assert.match(text, /### Part 1[\s\S]*summary 1/);
    assert.match(text, /### Part 2[\s\S]*summary 2/);
    assert.match(text, /### Part 3[\s\S]*summary 3/);
});

test("digest_text reads a url when no text is given", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const target = String(input);
        calls.push(target);
        if (target === "https://example.com/page") {
            return new Response("<p>Hello world</p>", {
                headers: { "content-type": "text/html" },
            });
        }
        const body = JSON.parse(init.body);
        assert.match(body.messages[1].content, /Hello world/);
        return chatResponse("A greeting.");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "digest_text",
        arguments: { url: "https://example.com/page" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(calls, [
        "https://example.com/page",
        "https://gen.pollinations.ai/v1/chat/completions",
    ]);
    assert.match(result.content[0].text, /Source: https:\/\/example.com\/page/);
    assert.match(result.content[0].text, /A greeting\./);
});

test("digest_text requires text or url", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "digest_text",
        arguments: {},
    });
    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("uses shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            { error: { message: "Insufficient balance" } },
            { status: 402 },
        ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "digest_text",
        arguments: { text: "Some text to summarise." },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient balance/);
});

test("chunkText keeps reading order and never drops text", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i}.`).join(
        " ",
    );
    const chunks = chunkText(text, 200);
    assert.ok(chunks.length > 1);
    assert.equal(
        chunks.join(" ").replace(/\s+/g, " "),
        text.replace(/\s+/g, " "),
    );
    for (const chunk of chunks) {
        assert.ok(chunk.length <= 260, `chunk too long: ${chunk.length}`);
    }
});

test("chunkText returns nothing for empty input", () => {
    assert.deepEqual(chunkText(""), []);
    assert.deepEqual(chunkText(null), []);
    assert.deepEqual(chunkText("   \n\n "), []);
});

test("formatDigest labels a single part without headings", () => {
    const single = formatDigest({ parts: ["one"], source: "s", charCount: 10 });
    assert.doesNotMatch(single, /### Part/);
    assert.match(single, /Source: s/);
    const empty = formatDigest({ parts: [] });
    assert.equal(empty, "No content to summarise.");
});
