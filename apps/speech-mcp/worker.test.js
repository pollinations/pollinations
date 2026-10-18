import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["list_speech_models", "text_to_speech", "transcribe"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "speech-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://speech-mcp.pollinations.ai"),
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
        new Request("https://speech-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://speech-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="speech-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://speech-mcp.pollinations.ai/mcp"),
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
        new Request("https://speech-mcp.pollinations.ai", {
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

test("text_to_speech returns audio and forwards the caller's key", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/audio/speech",
        );
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        assert.equal(
            new Headers(init.headers).get("content-type"),
            "application/json",
        );
        assert.deepEqual(JSON.parse(init.body), {
            input: "Hello world",
            voice: "nova",
            model: "openai/tts-1",
            response_format: "mp3",
            instructions: "Say it cheerfully.",
        });
        return new Response(Buffer.from("FAKEAUDIO"), {
            headers: { "Content-Type": "audio/mpeg" },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "text_to_speech",
        arguments: {
            input: "Hello world",
            voice: "nova",
            model: "openai/tts-1",
            response_format: "mp3",
            instructions: "Say it cheerfully.",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "audio");
    assert.equal(result.content[0].mimeType, "audio/mpeg");
    assert.equal(
        Buffer.from(result.content[0].data, "base64").toString("utf8"),
        "FAKEAUDIO",
    );
});

test("transcribe uploads the audio as multipart with the caller's key", async (t) => {
    const audioBase64 = Buffer.from("FAKEAUDIO").toString("base64");
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/audio/transcriptions",
        );
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        // fetch sets the multipart boundary itself, never a fixed content-type.
        assert.equal(new Headers(init.headers).get("content-type"), null);
        const form = init.body;
        assert.ok(form instanceof FormData);
        const file = form.get("file");
        assert.equal(file.name, "recording.mp3");
        assert.equal(await file.text(), "FAKEAUDIO");
        assert.equal(form.get("model"), "microsoft/mai-transcribe-2");
        assert.equal(form.get("language"), "en");
        assert.equal(form.get("response_format"), "verbose_json");
        assert.equal(form.get("prompt"), null);
        return Response.json({ text: "Hello world." });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "transcribe",
        arguments: {
            audio: audioBase64,
            filename: "recording.mp3",
            model: "microsoft/mai-transcribe-2",
            language: "en",
            response_format: "verbose_json",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        text: "Hello world.",
    });
});

test("transcribe accepts a data URI and keeps its mime type", async (t) => {
    const audioBase64 = Buffer.from("FAKEAUDIO").toString("base64");
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const file = init.body.get("file");
        assert.equal(file.type, "audio/wav");
        assert.equal(file.name, "audio.mp3");
        return Response.json({ text: "Hello world." });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "transcribe",
        arguments: { audio: `data:audio/wav;base64,${audioBase64}` },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        text: "Hello world.",
    });
});

test("list_speech_models returns the live audio catalog", async (t) => {
    let calls = 0;
    const catalog = [
        {
            name: "openai/tts-1",
            aliases: ["tts-1", "tts"],
            voices: ["alloy", "nova"],
            supported_endpoints: ["/v1/audio/speech"],
        },
    ];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(String(input), "https://gen.pollinations.ai/audio/models");
        assert.equal(init.method, undefined);
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return Response.json(catalog);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "list_speech_models",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text), catalog);
});

test("rejects invalid audio and empty input before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const arguments_ of [
        { input: "" },
        // Not 4 characters of valid base64 after the schema's min length.
        { audio: "nope!!!" },
        { audio: "data:text/plain,unencoded" },
        { audio: Buffer.from(new Uint8Array(0)).toString("base64") },
    ]) {
        const name = "input" in arguments_ ? "text_to_speech" : "transcribe";
        const result = await client.callTool({ name, arguments: arguments_ });
        assert.equal(result.isError, true, JSON.stringify(arguments_));
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("unexpected bulk fetch");
    });
    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");
    t.after(() => Promise.all([firstClient.close(), secondClient.close()]));
    const [first, second] = await Promise.all([
        firstClient.listTools(),
        secondClient.listTools(),
    ]);
    assert.deepEqual(
        first.tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    assert.deepEqual(
        second.tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
});

test("uses shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/audio/speech",
        );
        return Response.json(
            { error: { message: "Insufficient balance" } },
            { status: 402 },
        );
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "text_to_speech",
        arguments: { input: "Hello" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient balance/);
});
