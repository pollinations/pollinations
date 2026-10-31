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
        { name: "pokemon-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://pokemon-mcp.pollinations.ai"),
        { fetch: localFetch, requestInit: {} },
    );
    await client.connect(transport);
    return client;
}

test("serves health endpoint", async () => {
    const health = await worker.fetch(
        new Request("https://pokemon-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
});

test("pokemon_lookup returns pikachu", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "pokemon_lookup",
        arguments: { name: "pikachu" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.name, "pikachu");
    assert.ok(parsed.id > 0);
    assert.ok(parsed.types.includes("electric"));
    assert.ok(parsed.base_stats.speed > 0);
    await client.close();
});

test("pokemon_lookup handles missing pokemon", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "pokemon_lookup",
        arguments: { name: "definitely-not-a-pokemon-xyz" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.error);
    await client.close();
});

test("pokemon_compare picks stronger", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "pokemon_compare",
        arguments: { first: "mewtwo", second: "onix" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.first.name, "mewtwo");
    assert.equal(parsed.second.name, "onix");
    assert.ok(parsed.stronger === "mewtwo");
    await client.close();
});

test("pokemon_lookup supports pokedex id", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "pokemon_lookup",
        arguments: { name: "1" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.name, "bulbasaur");
    await client.close();
});
