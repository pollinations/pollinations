import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_emoji_scoped";
const EXPECTED_TOOLS = ["emoji_name", "search_emoji"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "emoji-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://emoji-mcp.pollinations.ai"),
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
        new Request("https://emoji-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.endpoint, "/");
    assert.ok(body.emoji > 100, "should embed a useful emoji set");

    const unauthorized = await worker.fetch(
        new Request("https://emoji-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="emoji-mcp.pollinations.ai"',
    );
});

test("advertises the emoji tools", async () => {
    const client = await connectClient();
    try {
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_TOOLS);
    } finally {
        await client.close();
    }
});

test("search_emoji finds emoji by keyword and by name", async () => {
    const client = await connectClient();
    try {
        const byKeyword = await client.callTool({
            name: "search_emoji",
            arguments: { query: "fire" },
        });
        const keywordText = byKeyword.content[0].text;
        assert.match(keywordText, /🔥/);

        const byName = await client.callTool({
            name: "search_emoji",
            arguments: { query: "rocket" },
        });
        assert.match(byName.content[0].text, /🚀/);

        const limited = await client.callTool({
            name: "search_emoji",
            arguments: { query: "a", limit: 3 },
        });
        const lines = limited.content[0].text.split("\n").slice(1);
        assert.ok(lines.length <= 3, `limit respected, got ${lines.length}`);
    } finally {
        await client.close();
    }
});

test("search_emoji reports an empty result instead of failing", async () => {
    const client = await connectClient();
    try {
        const res = await client.callTool({
            name: "search_emoji",
            arguments: { query: "zzzznotathing" },
        });
        assert.match(res.content[0].text, /No emoji matched/);
    } finally {
        await client.close();
    }
});

test("emoji_name resolves exact names and suggests near matches", async () => {
    const client = await connectClient();
    try {
        const exact = await client.callTool({
            name: "emoji_name",
            arguments: { name: "thumbs_up" },
        });
        assert.match(exact.content[0].text, /👍/);

        const spaced = await client.callTool({
            name: "emoji_name",
            arguments: { name: "thumbs up" },
        });
        assert.match(spaced.content[0].text, /👍/);

        const missing = await client.callTool({
            name: "emoji_name",
            arguments: { name: "rocketo" },
        });
        assert.match(missing.content[0].text, /No emoji named/);
        assert.match(missing.content[0].text, /Closest matches/);
    } finally {
        await client.close();
    }
});
