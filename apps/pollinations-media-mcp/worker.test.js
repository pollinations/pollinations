import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_token";
const EXPECTED_TOOLS = ["generate_image", "generate_audio"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "pollinations-media-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://pollinations-media-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://pollinations-media-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const unauthorized = await worker.fetch(
        new Request("https://pollinations-media-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
});

test("lists expected tools", async () => {
    const client = await connectClient();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, EXPECTED_TOOLS);
    await client.close();
});
