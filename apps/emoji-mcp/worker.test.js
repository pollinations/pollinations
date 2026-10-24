import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient() {
    const client = new Client(
        { name: "emoji-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://emoji-mcp.pollinations.ai"),
        { fetch: localFetch, requestInit: {} },
    );
    await client.connect(transport);
    return client;
}

test("serves health endpoint", async () => {
    const health = await worker.fetch(
        new Request("https://emoji-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
});

test("search_emoji finds pizza", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "search_emoji",
        arguments: { keyword: "pizza" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.count >= 1);
    assert.ok(parsed.results.some((r) => r.emoji === "🍕"));
    await client.close();
});

test("search_emoji finds laugh", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "search_emoji",
        arguments: { keyword: "laugh" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.results.some((r) => r.emoji === "😂" || r.emoji === "🤣"));
    await client.close();
});

test("emoji_name returns thumbs up", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "emoji_name",
        arguments: { emoji: "👍" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.found, true);
    assert.match(parsed.name, /thumbs up/i);
    await client.close();
});

test("emoji_name unknown emoji reports found false", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "emoji_name",
        arguments: { emoji: "❎" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.found, false);
    await client.close();
});

test("search_emoji respects limit", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "search_emoji",
        arguments: { keyword: "heart", limit: 2 },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.count <= 2);
    await client.close();
});
