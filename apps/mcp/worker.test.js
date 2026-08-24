import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "chatCompletion",
    "generateImage",
    "generateVideo",
    "getBalance",
    "getUsage",
    "listModels",
    "textToSpeech",
    "transcribeAudio",
];

function localFetch(input, init) {
    return worker.fetch(
        input instanceof Request ? input : new Request(input, init),
    );
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: {
                    headers: { Authorization: `Bearer ${token}` },
                },
            },
        ),
    );
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).stateless, true);

    const unauthorized = await worker.fetch(
        new Request("https://mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="mcp.pollinations.ai"',
    );
});

test("serves exactly eight tools to modern and legacy clients", async () => {
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

test("keeps bearer tokens request-scoped and returns raw balances", async (t) => {
    const originalFetch = globalThis.fetch;
    const seen = new Set();
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/account/balance",
        );
        const authorization = new Headers(init?.headers).get("authorization");
        seen.add(authorization);
        return Response.json({
            balance: authorization === "Bearer pk_first" ? 1 : 2,
            accountBalance: { paid: 3 },
        });
    };

    const options = { versionNegotiation: { mode: "auto" } };
    const first = await connectClient(options, "pk_first");
    const second = await connectClient(options, "sk_second");
    const [firstResult, secondResult] = await Promise.all([
        first.callTool({ name: "getBalance", arguments: {} }),
        second.callTool({ name: "getBalance", arguments: {} }),
    ]);
    assert.match(firstResult.content[0].text, /"balance": 1/);
    assert.match(firstResult.content[0].text, /"accountBalance"/);
    assert.match(secondResult.content[0].text, /"balance": 2/);
    assert.deepEqual(seen, new Set(["Bearer pk_first", "Bearer sk_second"]));
    await Promise.all([first.close(), second.close()]);
});

test("passes chat requests and responses through without reconstruction", async (t) => {
    const originalFetch = globalThis.fetch;
    let requestBody;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        requestBody = JSON.parse(init.body);
        return Response.json({
            id: "chatcmpl-test",
            choices: [
                { index: 0, message: { role: "assistant", content: "one" } },
                { index: 1, message: { role: "assistant", content: "two" } },
            ],
            provider_extension: { trace: "kept" },
        });
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "chatCompletion",
        arguments: {
            model: "openai",
            messages: [{ role: "user", content: "hello" }],
            provider_options: { custom: true },
        },
    });
    assert.deepEqual(requestBody, {
        model: "openai",
        messages: [{ role: "user", content: "hello" }],
        provider_options: { custom: true },
    });
    assert.match(result.content[0].text, /"index": 1/);
    assert.match(result.content[0].text, /"provider_extension"/);
    await client.close();
});

test("validates then cancels URL-mode media bodies", async (t) => {
    const originalFetch = globalThis.fetch;
    let cancelled = false;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/image/a%20bee?model=flux",
        );
        assert.equal(
            new Headers(init?.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return new Response(
            new ReadableStream({
                pull(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                },
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "Content-Type": "image/png" } },
        );
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "generateImage",
        arguments: { prompt: "a bee", model: "flux" },
    });
    assert.equal(
        result.content[0].text,
        "https://gen.pollinations.ai/image/a%20bee?model=flux",
    );
    assert.equal(cancelled, true);
    await client.close();
});

test("proxies raw model and key-usage data", async (t) => {
    const originalFetch = globalThis.fetch;
    const urls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/models")) {
            return Response.json([{ name: "openai", new_field: "kept" }]);
        }
        if (url.endsWith("/account/key/usage?days=7&limit=5")) {
            return Response.json({
                events: [{ id: "event-1" }],
                next: "cursor",
            });
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const models = await client.callTool({ name: "listModels", arguments: {} });
    const usage = await client.callTool({
        name: "getUsage",
        arguments: { days: 7, limit: 5 },
    });
    assert.match(models.content[0].text, /"new_field": "kept"/);
    assert.match(usage.content[0].text, /"next": "cursor"/);
    assert.deepEqual(urls, [
        "https://gen.pollinations.ai/models",
        "https://gen.pollinations.ai/account/key/usage?days=7&limit=5",
    ]);
    await client.close();
});
