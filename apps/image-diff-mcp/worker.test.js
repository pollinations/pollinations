import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["compare_images"];
const IMAGE_A = "https://example.com/a.png";
const IMAGE_B = "https://example.com/b.png";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "image-diff-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://image-diff-mcp.pollinations.ai"),
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

function visionResponse(result) {
    return Response.json({
        id: "chatcmpl-test",
        model: "openai",
        choices: [
            {
                message: {
                    role: "assistant",
                    content: JSON.stringify(result),
                },
            },
        ],
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://image-diff-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://image-diff-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="image-diff-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://image-diff-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("lists compare_images tool", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    try {
        const tools = (await client.listTools()).tools;
        assert.deepEqual(tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);
    } finally {
        await client.close();
    }
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://image-diff-mcp.pollinations.ai", {
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

test("sends two images and json_schema response_format to chat completions", async (t) => {
    let calls = 0;
    const expected = {
        identical: false,
        similarity: "major_differences",
        differences: ["one is red, the other is blue"],
        legibility: "high",
    };
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        const body = JSON.parse(init.body);
        assert.equal(body.model, "openai");
        const content = body.messages[0].content;
        assert.equal(content.length, 3);
        assert.equal(content[0].type, "text");
        assert.equal(content[1].image_url.url, IMAGE_A);
        assert.equal(content[2].image_url.url, IMAGE_B);
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.strict, true);
        return visionResponse(expected);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
});

test("forwards focus into the instruction text", async (t) => {
    let seenText;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        seenText = JSON.parse(init.body).messages[0].content[0].text;
        return visionResponse({
            identical: true,
            similarity: "identical",
            differences: [],
            legibility: "high",
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B, focus: "text" },
    });
    assert.match(
        seenText,
        /Focus specifically on differences related to: text/,
    );
});

test("rejects invalid image references before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const badUrl = await client.callTool({
        name: "compare_images",
        arguments: { image_a: "not-a-url", image_b: IMAGE_B },
    });
    assert.equal(badUrl.isError, true);

    const badDataUri = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: "data:not-valid" },
    });
    assert.equal(badDataUri.isError, true);

    const emptyImage = await client.callTool({
        name: "compare_images",
        arguments: { image_a: "", image_b: IMAGE_B },
    });
    assert.equal(emptyImage.isError, true);

    assert.equal(fetchMock.mock.callCount(), 0);
});

test("accepts valid data: URI images", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        visionResponse({
            identical: true,
            similarity: "identical",
            differences: [],
            legibility: "medium",
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: tinyPng, image_b: tinyPng },
    });
    assert.notEqual(result.isError, true);
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seenAuthorizations = new Set();
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const authorization = new Headers(init.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return visionResponse({
            identical: authorization === "Bearer pk_first",
            similarity:
                authorization === "Bearer pk_first"
                    ? "identical"
                    : "major_differences",
            differences: [],
            legibility: "high",
        });
    });
    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");
    t.after(() => Promise.all([firstClient.close(), secondClient.close()]));
    const request = {
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    };
    const [first, second] = await Promise.all([
        firstClient.callTool(request),
        secondClient.callTool(request),
    ]);
    assert.equal(JSON.parse(first.content[0].text).identical, true);
    assert.equal(JSON.parse(second.content[0].text).identical, false);
    assert.deepEqual(
        seenAuthorizations,
        new Set(["Bearer pk_first", "Bearer sk_second"]),
    );
});

test("maps upstream 402 errors through the shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        return Response.json(
            { error: { message: "Insufficient balance" } },
            { status: 402 },
        );
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient balance/);
});

test("maps upstream 429 errors through the shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: { message: "slow down" } }, { status: 429 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /slow down/);
});

test("maps upstream 500 errors through the shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: { message: "boom" } }, { status: 500 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Server error/);
});

test("rejects a syntactically valid response that doesn't match the result schema", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        visionResponse({ foo: "bar" }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /did not match the expected schema/);
});

test("rejects unexpected upstream response shapes", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ id: "chatcmpl-empty", choices: [] }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /returned no comparison result/);
});

test("rejects an image data URI over the decoded-byte size cap", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for oversized input");
    });
    const client = await connectClient();
    t.after(() => client.close());
    // Just over the 1 MiB decoded cap, but well under the MCP transport's
    // own 4 MiB total request body ceiling, so this exercises our schema
    // rejection rather than a raw transport-level 413.
    const oversized = `data:image/png;base64,${"A".repeat(1.5 * 1024 * 1024)}`;
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: oversized, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("rejects an http(s) URL over the URL length cap", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const longUrl = `https://example.com/${"a".repeat(9 * 1024)}.png`;
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: longUrl, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
});

test("forwards a custom model override to upstream", async (t) => {
    let seenModel;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        seenModel = JSON.parse(init.body).model;
        return visionResponse({
            identical: true,
            similarity: "identical",
            differences: [],
            legibility: "high",
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    await client.callTool({
        name: "compare_images",
        arguments: {
            image_a: IMAGE_A,
            image_b: IMAGE_B,
            model: "openai-large",
        },
    });
    assert.equal(seenModel, "openai-large");
});

test("rejects malformed JSON content from the vision model", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            id: "chatcmpl-bad",
            choices: [{ message: { role: "assistant", content: "not json" } }],
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: { image_a: IMAGE_A, image_b: IMAGE_B },
    });
    assert.equal(result.isError, true);
});

// Env-gated live test against the real Pollinations API. Skipped by default,
// same pattern as other MCP workers in this repo. Run with:
//   IMAGE_DIFF_MCP_LIVE_TEST=1 POLLINATIONS_API_KEY=sk_... node --test worker.test.js
test("live: compares two real images against gen.pollinations.ai", {
    skip: !process.env.IMAGE_DIFF_MCP_LIVE_TEST,
}, async (t) => {
    const token = process.env.POLLINATIONS_API_KEY;
    assert.ok(token, "POLLINATIONS_API_KEY must be set for the live test");
    const client = await connectClient({}, token);
    t.after(() => client.close());
    const result = await client.callTool({
        name: "compare_images",
        arguments: {
            image_a:
                "https://image.pollinations.ai/prompt/a%20red%20apple?seed=1",
            image_b:
                "https://image.pollinations.ai/prompt/a%20blue%20car?seed=2",
        },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.identical, false);
});
