import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_usage_mcp";
const EXPECTED_TOOLS = ["get_balance", "get_model_info", "get_usage_history"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "usage-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://usage-mcp.pollinations.ai"),
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

test("serves the health check with the expected structure", async () => {
    const health = await worker.fetch(
        new Request("https://usage-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
        name: "usage-mcp",
        transport: "streamable-http",
        endpoint: "/",
        stateless: true,
    });
});

test("requires a bearer token", async () => {
    const unauthorized = await worker.fetch(
        new Request("https://usage-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="usage-mcp.pollinations.ai"',
    );
});

test("returns 404 for non-root paths", async () => {
    const oldEndpoint = await worker.fetch(
        new Request("https://usage-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("lists all three tools over current and 2025 Streamable HTTP", async () => {
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
        new Request("https://usage-mcp.pollinations.ai", {
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

test("forwards get_balance to the account balance endpoint with the caller key", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/account/balance",
        );
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return Response.json({ balance: 42, accountBalance: 100 });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_balance",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        balance: 42,
        accountBalance: 100,
    });
});

test("passes the limit through to the usage history endpoint", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        seen.push(String(input));
        return Response.json({ data: [] });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    await client.callTool({ name: "get_usage_history", arguments: {} });
    await client.callTool({
        name: "get_usage_history",
        arguments: { limit: 7 },
    });
    assert.deepEqual(seen, [
        "https://gen.pollinations.ai/account/usage?limit=20",
        "https://gen.pollinations.ai/account/usage?limit=7",
    ]);
});

test("URL-encodes the model name in get_model_info", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen.push(String(input));
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return Response.json({
            id: "openai/gpt-5.4-nano",
            object: "model",
            owned_by: "OpenAI",
            category: "text",
            title: "GPT-5.4 Nano",
            pricing: { currency: "pollen" },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_model_info",
        arguments: { model_name: "openai/gpt-5.4-nano" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(seen, [
        "https://gen.pollinations.ai/v1/models/openai%2Fgpt-5.4-nano",
    ]);
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seenAuthorizations = new Set();
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/account/balance",
        );
        const authorization = new Headers(init.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return Response.json({
            balance: authorization === "Bearer pk_first" ? 11 : 99,
        });
    });
    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");
    t.after(() => Promise.all([firstClient.close(), secondClient.close()]));
    const request = { name: "get_balance", arguments: {} };
    const [first, second] = await Promise.all([
        firstClient.callTool(request),
        secondClient.callTool(request),
    ]);
    assert.deepEqual(JSON.parse(first.content[0].text), { balance: 11 });
    assert.deepEqual(JSON.parse(second.content[0].text), { balance: 99 });
    assert.deepEqual(
        seenAuthorizations,
        new Set(["Bearer pk_first", "Bearer sk_second"]),
    );
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const arguments_ of [
        { limit: 0 },
        { limit: 101 },
        { limit: "x" },
        { limit: 1.5 },
    ]) {
        const result = await client.callTool({
            name: "get_usage_history",
            arguments: arguments_,
        });
        assert.equal(result.isError, true);
    }
    for (const arguments_ of [{ model_name: "" }, { model_name: 7 }]) {
        const result = await client.callTool({
            name: "get_model_info",
            arguments: arguments_,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("reports upstream failures as tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/models/does-not-exist",
        );
        // Real envelope of the retrieve route: `{success, error, status}`, not
        // a bare `{error: {message}}`.
        return Response.json(
            {
                success: false,
                error: {
                    message: "Model 'does-not-exist' not found",
                    code: "NOT_FOUND",
                },
                status: 404,
            },
            { status: 404 },
        );
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_model_info",
        arguments: { model_name: "does-not-exist" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /HTTP 404/);
    assert.match(result.content[0].text, /not found/);
});
