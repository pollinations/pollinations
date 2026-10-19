import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const EXPECTED_TOOLS = [
    "describe_image",
    "extract_data",
    "list_vision_models",
    "read_text",
];
const IMAGE = "https://example.com/receipt.png";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "vision-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://vision-mcp.pollinations.ai"),
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

function answer(text) {
    return Response.json({
        id: "chat-test",
        model: DEFAULT_MODEL,
        choices: [{ index: 0, message: { role: "assistant", content: text } }],
    });
}

function readBody(init) {
    return JSON.parse(init.body);
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://vision-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.endpoint, "/");
    assert.equal(body.stateless, true);

    const unauthorized = await worker.fetch(
        new Request("https://vision-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="vision-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://vision-mcp.pollinations.ai/mcp"),
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
        new Request("https://vision-mcp.pollinations.ai", {
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

test("describe_image sends the image with the caller's key", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(String(input), CHAT_URL);
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        assert.equal(
            new Headers(init.headers).get("content-type"),
            "application/json",
        );
        assert.deepEqual(readBody(init), {
            model: DEFAULT_MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is the total?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: IMAGE,
                                detail: "high",
                            },
                        },
                    ],
                },
            ],
        });
        return answer("The total is 42.00.");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "describe_image",
        arguments: {
            image: IMAGE,
            question: "What is the total?",
            detail: "high",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content[0].text, "The total is 42.00.");
});

test("describe_image defaults the question and omits the detail hint", async (t) => {
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const body = readBody(init);
        assert.equal(body.model, "openai/gpt-5.4-nano");
        const [, image] = body.messages[0].content;
        assert.equal(image.image_url.detail, undefined);
        assert.match(body.messages[0].content[0].text, /Describe this image/);
        return answer("A screenshot of a dashboard.");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "describe_image",
        arguments: { image: IMAGE },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /dashboard/);
});

test("read_text asks for a verbatim transcription and maps NO_TEXT", async (t) => {
    const prompts = [];
    let reply = "Total: 42.00\nThank you";
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const body = readBody(init);
        prompts.push(body.messages[0].content[0].text);
        assert.equal(body.messages[0].content[1].image_url.detail, "high");
        return answer(reply);
    });
    const client = await connectClient();
    t.after(() => client.close());

    const transcribed = await client.callTool({
        name: "read_text",
        arguments: { image: IMAGE, language: "Indonesian" },
    });
    assert.notEqual(transcribed.isError, true);
    assert.equal(transcribed.content[0].text, "Total: 42.00\nThank you");
    assert.match(prompts[0], /Do not translate/);
    assert.match(prompts[0], /most likely in Indonesian/);

    reply = "NO_TEXT";
    const empty = await client.callTool({
        name: "read_text",
        arguments: { image: IMAGE },
    });
    assert.equal(empty.content[0].text, "No readable text found.");
});

test("extract_data accepts a data URI and validates against the schema", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        calls++;
        const body = readBody(init);
        assert.equal(body.messages[0].role, "system");
        assert.match(
            body.messages[1].content[0].text,
            /"total":\{"type":"number"\}/,
        );
        assert.match(
            body.messages[1].content[1].image_url.url,
            /^data:image\/png;base64,/,
        );
        return answer('```json\n{"total": 12.5, "items": ["coffee"]}\n```');
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "extract_data",
        arguments: {
            image: "data:image/png;base64,iVBORw0KGgo=",
            instruction: "Read the total and the items.",
            schema: {
                type: "object",
                required: ["total"],
                properties: {
                    total: { type: "number" },
                    items: { type: "array", items: { type: "string" } },
                },
            },
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        total: 12.5,
        items: ["coffee"],
    });
});

test("extract_data retries once with the schema errors", async (t) => {
    const bodies = [];
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        bodies.push(readBody(init));
        return bodies.length === 1
            ? answer('{"total": "twelve"}')
            : answer('{"total": 12}');
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "extract_data",
        arguments: {
            image: IMAGE,
            instruction: "Read the total.",
            schema: {
                type: "object",
                required: ["total"],
                properties: { total: { type: "number" } },
            },
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), { total: 12 });
    assert.equal(bodies.length, 2);
    const retry = bodies[1].messages;
    assert.equal(retry.at(-2).role, "assistant");
    assert.match(retry.at(-1).content, /\$\.total must be number/);
});

test("extract_data fails after two rejected replies", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return answer("I cannot read this image.");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "extract_data",
        arguments: { image: IMAGE, instruction: "Read the total." },
    });
    assert.equal(result.isError, true);
    assert.equal(calls, 2);
    assert.match(result.content[0].text, /not return matching JSON/);
});

test("list_vision_models keeps only image-input models", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://gen.pollinations.ai/text/models");
        return Response.json([
            {
                name: "openai/gpt-5.4-nano",
                title: "GPT-5.4 Nano",
                description: "Fast all-rounder",
                input_modalities: ["text", "image"],
                context_length: 400000,
                max_reference_images: 10,
                paid_only: false,
            },
            {
                name: "openai/gpt-oss-20b",
                title: "GPT OSS",
                input_modalities: ["text"],
                paid_only: false,
            },
            {
                name: "google/gemini-3.7-flash",
                title: "Gemini",
                input_modalities: ["text", "image", "video"],
                context_length: 1000000,
                paid_only: true,
            },
        ]);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "list_vision_models",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(
        JSON.parse(result.content[0].text).map(({ id }) => id),
        ["google/gemini-3.7-flash", "openai/gpt-5.4-nano"],
    );
});

test("rejects unusable images before calling the model", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const image of [
        "http://example.com/insecure.png",
        "file:///etc/passwd",
        "not a url",
        "data:text/plain;base64,aGVsbG8=",
        "data:image/png;base64,not-base64!",
        "data:image/svg+xml,<svg/>",
    ]) {
        const result = await client.callTool({
            name: "describe_image",
            arguments: { image },
        });
        assert.equal(result.isError, true, image);
    }
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
        name: "describe_image",
        arguments: { image: IMAGE },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient balance/);
});
