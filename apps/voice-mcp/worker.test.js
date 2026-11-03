import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["changeVoice", "isolateAudio"];
const SOURCE_URL = "https://example.org/voice.mp3";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "voice-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://voice-mcp.pollinations.ai"),
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
        new Request("https://voice-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://voice-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="voice-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://voice-mcp.pollinations.ai/mcp"),
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
        new Request("https://voice-mcp.pollinations.ai", {
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

test("isolateAudio forwards the source file to the voice-isolator with the caller key", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = String(input);
        if (url === SOURCE_URL) {
            assert.equal(init.redirect, "manual");
            return new Response("fake-source-bytes", {
                status: 200,
                headers: { "content-type": "audio/mpeg" },
            });
        }
        assert.equal(url, "https://gen.pollinations.ai/v1/audio/voice-isolator");
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        assert.ok(init.body instanceof FormData, "body is FormData");
        const form = init.body;
        assert.ok(form.get("file") instanceof Blob);
        assert.equal(form.get("model"), "elevenlabs/voice-isolator");
        return new Response("gen-bytes", {
            status: 200,
            headers: {
                "content-type": "audio/mpeg",
                Link: '<https://media.pollinations.ai/isolated.mp3>; rel="enclosure"',
            },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "isolateAudio",
        arguments: {
            source: SOURCE_URL,
            model: "elevenlabs/voice-isolator",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content[0].type, "resource_link");
    assert.equal(result.content[0].uri, "https://media.pollinations.ai/isolated.mp3");
    assert.equal(result.content[0].mimeType, "audio/mpeg");
    assert.equal(result.content[1].type, "text");
});

test("changeVoice forwards voice and format, returns inline audio when no enclosure link", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = String(input);
        if (url === SOURCE_URL) {
            return new Response("fake-source-bytes", {
                status: 200,
                headers: { "content-type": "audio/mpeg" },
            });
        }
        assert.equal(url, "https://gen.pollinations.ai/v1/audio/voice-changer");
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        const form = init.body;
        assert.ok(form instanceof FormData);
        assert.equal(form.get("voice"), "nova");
        assert.equal(form.get("response_format"), "wav");
        assert.equal(form.get("model"), null);
        return new Response("gen-audio-bytes", {
            status: 200,
            headers: { "content-type": "audio/wav" },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "changeVoice",
        arguments: {
            source: SOURCE_URL,
            targetVoice: "nova",
            response_format: "wav",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content[0].type, "audio");
    assert.equal(result.content[0].mimeType, "audio/wav");
    assert.ok(result.content[0].data.length > 0);
    // base64 of "gen-audio-bytes"
    assert.equal(
        result.content[0].data,
        Buffer.from("gen-audio-bytes").toString("base64"),
    );
});

test("rejects non-public source URLs", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("must not fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const source of [
        "http://example.org/a.mp3",
        "https://localhost/a.mp3",
        "https://127.0.0.1/a.mp3",
        "https://user:pass@example.org/a.mp3",
    ]) {
        const result = await client.callTool({
            name: "isolateAudio",
            arguments: { source },
        });
        assert.equal(result.isError, true, source);
        assert.match(result.content[0].text, /public HTTPS URL/);
    }
});

test("maps gateway errors to readable messages", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = String(input);
        if (url === SOURCE_URL) {
            return new Response("fake-source-bytes", {
                status: 200,
                headers: { "content-type": "audio/mpeg" },
            });
        }
        return Response.json(
            { error: { message: "Insufficient pollen balance" } },
            { status: 402 },
        );
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "changeVoice",
        arguments: { source: SOURCE_URL, targetVoice: "nova" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient pollen balance/);
});