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
        { name: "whois-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://whois-mcp.pollinations.ai"),
        { fetch: localFetch, requestInit: {} },
    );
    await client.connect(transport);
    return client;
}

test("serves health endpoint", async () => {
    const health = await worker.fetch(
        new Request("https://whois-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
});

test("domain_whois returns example.com", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "domain_whois",
        arguments: { domain: "example.com" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.domain, "example.com");
    assert.ok(parsed.handle);
    assert.ok(parsed.events.registration);
    assert.ok(Array.isArray(parsed.nameservers));
    await client.close();
});

test("domain_whois fetches nameservers for google.com", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "domain_whois",
        arguments: { domain: "google.com" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(parsed.domain, "google.com");
    assert.ok(parsed.nameservers.length > 0);
    await client.close();
});

test("ip_whois returns 8.8.8.8 network", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "ip_whois",
        arguments: { ip: "8.8.8.8" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.handle || parsed.startAddress || parsed.country);
    assert.ok(Array.isArray(parsed.status) || parsed.name);
    await client.close();
});

test("domain_whois reports missing domain error", async () => {
    const client = await connectClient();
    const res = await client.callTool({
        name: "domain_whois",
        arguments: { domain: "definitely-not-a-real-tld-xyz123.com" },
    });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.ok(parsed.error);
    await client.close();
});
