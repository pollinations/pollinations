import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "cidr-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://cidr-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${TOKEN}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://cidr-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://cidr-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="cidr-mcp.pollinations.ai"',
    );
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name),
        ["inspect_cidr"],
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name),
        ["inspect_cidr"],
    );
    await legacy.close();
});

test("normalizes IPv4 ranges and checks candidate addresses", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_cidr",
        arguments: {
            cidr: "192.168.1.42/24",
            addresses: ["192.168.1.200", "192.168.2.1", "not-an-ip"],
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        cidr: "192.168.1.0/24",
        version: 4,
        prefix_length: 24,
        netmask: "255.255.255.0",
        network: "192.168.1.0",
        last_address: "192.168.1.255",
        broadcast: "192.168.1.255",
        address_count: "256",
        classification: "private",
        checks: [
            {
                address: "192.168.1.200",
                valid: true,
                normalized: "192.168.1.200",
                version: 4,
                classification: "private",
                contained: true,
            },
            {
                address: "192.168.2.1",
                valid: true,
                normalized: "192.168.2.1",
                version: 4,
                classification: "private",
                contained: false,
            },
            { address: "not-an-ip", valid: false, contained: false },
        ],
    });
});

test("reports exact IPv6 boundaries and address counts", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_cidr",
        arguments: {
            cidr: "2001:db8::abcd/64",
            addresses: ["2001:db8::1", "2001:db9::1"],
        },
    });
    assert.notEqual(result.isError, true);
    const value = JSON.parse(result.content[0].text);
    assert.equal(value.cidr, "2001:db8::/64");
    assert.equal(value.netmask, "ffff:ffff:ffff:ffff::");
    assert.equal(value.last_address, "2001:db8::ffff:ffff:ffff:ffff");
    assert.equal(value.broadcast, null);
    assert.equal(value.address_count, "18446744073709551616");
    assert.deepEqual(
        value.checks.map(({ contained }) => contained),
        [true, false],
    );
});

test("rejects invalid CIDR ranges", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    for (const cidr of ["192.168.1.1/33", "2001:db8::/129", "not-a-cidr"]) {
        const result = await client.callTool({
            name: "inspect_cidr",
            arguments: { cidr },
        });
        assert.equal(result.isError, true);
    }
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://cidr-mcp.pollinations.ai", {
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
