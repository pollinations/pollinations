import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_abc";
const EXPECTED_TOOLS = [
    "discover_endpoints",
    "discover_models",
    "get_agent_card",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "pad-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://pollinations-agent-discovery.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

test("health and auth", async () => {
    const health = await worker.fetch(
        new Request(
            "https://pollinations-agent-discovery.pollinations.ai/health",
        ),
    );
    assert.equal(health.status, 200);
    const unauth = await worker.fetch(
        new Request("https://pollinations-agent-discovery.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauth.status, 401);
});

test("lists tools", async () => {
    const client = await connectClient();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, EXPECTED_TOOLS);
    await client.close();
});

test("discover_endpoints returns hardcoded list", async () => {
    const client = await connectClient();
    const result = await client.callTool({
        name: "discover_endpoints",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    await client.close();
});
