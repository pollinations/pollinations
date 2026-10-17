import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ENDPOINT = "https://collective-memory-mcp.pollinations.ai/";

function mockExternalFetch(t, calls) {
    return t.mock.method(globalThis, "fetch", async (input, init = {}) => {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;

        const request =
            input instanceof Request ? input : new Request(url, init);
        if (url.startsWith(ENDPOINT)) {
            return worker.fetch(request);
        }

        const headers = Object.fromEntries(request.headers.entries());
        calls.push({ url, method: request.method, headers });

        if (
            url ===
            "https://api.github.com/repos/pollinations/collective-memory/git/trees/main?recursive=1"
        ) {
            return Response.json({
                sha: "main",
                truncated: false,
                tree: [
                    {
                        path: "README.md",
                        mode: "100644",
                        type: "blob",
                        size: 1200,
                    },
                    {
                        path: "collabs/README.md",
                        mode: "100644",
                        type: "blob",
                        size: 640,
                    },
                    {
                        path: "pollinations/2026-10-16-mcp-server-guide.md",
                        mode: "100644",
                        type: "blob",
                        size: 1980,
                    },
                    {
                        path: "social/posts/2026-10-15-hello.md",
                        mode: "100644",
                        type: "blob",
                        size: 420,
                    },
                ],
            });
        }

        if (
            url ===
            "https://raw.githubusercontent.com/pollinations/collective-memory/main/README.md"
        ) {
            return new Response(
                "# Collective Memory\nShared agent notes across Pollinations.",
                {
                    status: 200,
                    headers: { "content-type": "text/plain; charset=utf-8" },
                },
            );
        }

        if (
            url ===
            "https://raw.githubusercontent.com/pollinations/collective-memory/main/pollinations/2026-10-16-mcp-server-guide.md"
        ) {
            return new Response(
                "# MCP Server Guide\nRegister MCP workers in shared/registry/mcp.ts and wire service bindings in gen.pollinations.ai.",
                {
                    status: 200,
                    headers: { "content-type": "text/plain; charset=utf-8" },
                },
            );
        }

        if (
            url ===
            "https://raw.githubusercontent.com/pollinations/collective-memory/main/collabs/README.md"
        ) {
            return new Response("# Collabs\nAgent collaboration logs.", {
                status: 200,
                headers: { "content-type": "text/plain; charset=utf-8" },
            });
        }

        return new Response("Not Found", { status: 404 });
    });
}

async function createConnectedClient(token = "sk_test_key") {
    const client = new Client({
        name: "collective-memory-mcp-test-client",
        version: "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
        requestInit: {
            headers: {
                authorization: `Bearer ${token}`,
            },
        },
    });
    await client.connect(transport);
    return { client, transport };
}

test("serves health and rejects unauthorized or invalid requests", async () => {
    const health = await worker.fetch(new Request(`${ENDPOINT}health`));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
        status: "ok",
        service: "collective-memory-mcp",
        endpoint: "/",
    });

    const missing = await worker.fetch(new Request(`${ENDPOINT}unknown`));
    assert.equal(missing.status, 404);

    for (const headers of [
        undefined,
        { authorization: "Basic abc" },
        { authorization: "Bearer" },
        { authorization: "Bearer a b" },
    ]) {
        const res = await worker.fetch(
            new Request(ENDPOINT, { method: "POST", headers }),
        );
        assert.equal(res.status, 401);
        assert.match(res.headers.get("WWW-Authenticate") ?? "", /^Bearer /);
    }

    const getRes = await worker.fetch(
        new Request(ENDPOINT, {
            method: "GET",
            headers: { authorization: "Bearer sk_test" },
        }),
    );
    assert.equal(getRes.status, 405);

    const batchRes = await worker.fetch(
        new Request(ENDPOINT, {
            method: "POST",
            headers: {
                authorization: "Bearer sk_test",
                "content-type": "application/json",
            },
            body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
        }),
    );
    assert.equal(batchRes.status, 400);
});

test("lists tools and calls list_memory_entries, read_memory_entry, and search_memory without leaking caller credentials", async (t) => {
    const calls = [];
    mockExternalFetch(t, calls);

    const { client, transport } = await createConnectedClient("sk_secret_123");
    try {
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((tool) => tool.name).sort(), [
            "list_memory_entries",
            "read_memory_entry",
            "search_memory",
        ]);

        const listRes = await client.callTool({
            name: "list_memory_entries",
            arguments: { space: "pollinations" },
        });
        assert.ok(!listRes.isError);
        const listPayload = JSON.parse(listRes.content[0].text);
        assert.equal(listPayload.repo, "pollinations/collective-memory");
        assert.deepEqual(listPayload.spaces, [
            "collabs",
            "pollinations",
            "social",
        ]);
        assert.equal(listPayload.matchedCount, 1);
        assert.equal(
            listPayload.entries[0].path,
            "pollinations/2026-10-16-mcp-server-guide.md",
        );

        const readRes = await client.callTool({
            name: "read_memory_entry",
            arguments: { path: "README.md" },
        });
        assert.ok(!readRes.isError);
        const readPayload = JSON.parse(readRes.content[0].text);
        assert.equal(readPayload.path, "README.md");
        assert.match(readPayload.content, /Shared agent notes/);

        const searchRes = await client.callTool({
            name: "search_memory",
            arguments: { query: "service bindings", space: "pollinations" },
        });
        assert.ok(!searchRes.isError);
        const searchPayload = JSON.parse(searchRes.content[0].text);
        assert.equal(searchPayload.matchCount, 1);
        assert.equal(
            searchPayload.matches[0].path,
            "pollinations/2026-10-16-mcp-server-guide.md",
        );
        assert.match(
            searchPayload.matches[0].snippets[0].excerpt,
            /service bindings/,
        );

        assert.ok(calls.length >= 3);
        for (const call of calls) {
            assert.equal(call.headers.authorization, undefined);
        }
    } finally {
        await transport.close();
    }
});

test("rejects traversal paths and handles missing entries with structured tool errors", async (t) => {
    const calls = [];
    mockExternalFetch(t, calls);

    const { client, transport } = await createConnectedClient("sk_secret_123");
    try {
        const badPath = await client.callTool({
            name: "read_memory_entry",
            arguments: { path: "../secrets.txt" },
        });
        assert.equal(badPath.isError, true);
        assert.match(badPath.content[0].text, /Invalid path/);
        assert.equal(calls.length, 0);

        const missingEntry = await client.callTool({
            name: "read_memory_entry",
            arguments: { path: "pollinations/does-not-exist.md" },
        });
        assert.equal(missingEntry.isError, true);
        assert.match(missingEntry.content[0].text, /was not found/);
    } finally {
        await transport.close();
    }
});

test("truncates oversized collective-memory file contents at 100,000 characters", async (t) => {
    const huge = `# Huge Note\n${"m".repeat(120_000)}`;
    t.mock.method(globalThis, "fetch", async (input, init = {}) => {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
        const request =
            input instanceof Request ? input : new Request(url, init);
        if (url.startsWith(ENDPOINT)) {
            return worker.fetch(request);
        }
        return new Response(huge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    });

    const { client, transport } = await createConnectedClient("sk_secret_123");
    try {
        const res = await client.callTool({
            name: "read_memory_entry",
            arguments: { path: "README.md" },
        });
        assert.ok(!res.isError);
        assert.match(res.content[0].text, /\[cut at 100000 characters\]/);
    } finally {
        await transport.close();
    }
});
