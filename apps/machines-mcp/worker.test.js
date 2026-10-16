import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "sandbox_create",
    "sandbox_kill",
    "sandbox_list",
    "sandbox_pause",
    "sandbox_read_file",
    "sandbox_run",
    "sandbox_write_file",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "machines-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://machines-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="machines-mcp.pollinations.ai"',
    );
});

test("lists the sandbox tools", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
});

test("calls the sandbox API with the caller's key", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const request = new Request(input, init);
        calls.push({
            method: request.method,
            url: request.url,
            key: request.headers.get("x-api-key"),
        });
        if (request.method === "GET") {
            return Response.json([
                {
                    sandboxID: "sbx1",
                    templateID: "pollinations",
                    alias: "pollinations",
                    startedAt: "2026-10-16T10:00:00Z",
                    endAt: "2026-10-16T10:05:00Z",
                    state: "paused",
                    cpuCount: 2,
                    memoryMB: 2048,
                },
            ]);
        }
        return new Response(null, { status: 204 });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const list = await client.callTool({ name: "sandbox_list", arguments: {} });
    assert.notEqual(list.isError, true);
    assert.deepEqual(JSON.parse(list.content[0].text)[0], {
        id: "sbx1",
        template: "pollinations",
        state: "paused",
        endAt: "2026-10-16T10:05:00.000Z",
    });

    const paused = await client.callTool({
        name: "sandbox_pause",
        arguments: { id: "sbx1" },
    });
    assert.deepEqual(JSON.parse(paused.content[0].text), { paused: true });

    const killed = await client.callTool({
        name: "sandbox_kill",
        arguments: { id: "sbx1" },
    });
    assert.deepEqual(JSON.parse(killed.content[0].text), { killed: true });

    assert.deepEqual(
        calls.map(({ method, url }) => `${method} ${new URL(url).pathname}`),
        [
            "GET /alpha/e2b/v2/sandboxes",
            "POST /alpha/e2b/sandboxes/sbx1/pause",
            "DELETE /alpha/e2b/sandboxes/sbx1",
        ],
    );
    assert.ok(
        calls.every(({ url }) =>
            url.startsWith("https://gen.pollinations.ai/"),
        ),
    );
    assert.ok(calls.every(({ key }) => key === TOKEN));
});

test("returns the API's message as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            {
                code: 403,
                message: "This API key does not have the machines permission",
            },
            { status: 403 },
        ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["sandbox_create", {}],
        ["sandbox_list", {}],
        ["sandbox_pause", { id: "sbx1" }],
        ["sandbox_kill", { id: "sbx1" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, name);
        assert.match(result.content[0].text, /machines permission/, name);
    }
});

test("keeps keys scoped to concurrent requests", async (t) => {
    const keys = new Set();
    t.mock.method(globalThis, "fetch", async (input, init) => {
        keys.add(new Request(input, init).headers.get("x-api-key"));
        return Response.json([]);
    });
    const [first, second] = await Promise.all([
        connectClient("pk_first"),
        connectClient("sk_second"),
    ]);
    t.after(() => Promise.all([first.close(), second.close()]));
    await Promise.all(
        [first, second].map((c) =>
            c.callTool({ name: "sandbox_list", arguments: {} }),
        ),
    );
    assert.deepEqual(keys, new Set(["pk_first", "sk_second"]));
});
