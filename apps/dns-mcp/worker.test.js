import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["dns_lookup", "dns_reverse"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "dns-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://dns-mcp.pollinations.ai"),
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

// Answer DNS-over-HTTPS through a stub so tests never leave the process.
function stubDns(handler) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        calls.push(url);
        return Response.json(handler(url));
    };
    return {
        calls,
        restore: () => {
            globalThis.fetch = originalFetch;
        },
    };
}

function readText(result) {
    return JSON.parse(result.content[0].text);
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://dns-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://dns-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="dns-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://dns-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
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
        new Request("https://dns-mcp.pollinations.ai", {
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

test("dns_lookup returns records with names and TTLs", async () => {
    const dns = stubDns(() => ({
        Status: 0,
        Question: [{ name: "example.com", type: 1 }],
        Answer: [
            { name: "example.com", type: 1, TTL: 300, data: "93.184.216.34" },
            { name: "example.com", type: 1, TTL: 300, data: "93.184.216.35" },
        ],
    }));
    try {
        const client = await connectClient();
        const result = await client.callTool({
            name: "dns_lookup",
            arguments: { name: "example.com", type: "A" },
        });
        const payload = readText(result);

        assert.equal(payload.status, "NOERROR");
        assert.equal(payload.records.length, 2);
        assert.deepEqual(payload.records[0], {
            name: "example.com",
            type: "A",
            ttl: 300,
            data: "93.184.216.34",
        });
        assert.equal(dns.calls[0].searchParams.get("name"), "example.com");
        assert.equal(dns.calls[0].searchParams.get("type"), "A");
        await client.close();
    } finally {
        dns.restore();
    }
});

test("dns_lookup reports NXDOMAIN without records", async () => {
    const dns = stubDns(() => ({
        Status: 3,
        Question: [{ name: "nope.test" }],
    }));
    try {
        const client = await connectClient();
        const payload = readText(
            await client.callTool({
                name: "dns_lookup",
                arguments: { name: "nope.test", type: "A" },
            }),
        );
        assert.equal(payload.status, "NXDOMAIN");
        assert.deepEqual(payload.records, []);
        await client.close();
    } finally {
        dns.restore();
    }
});

test("dns_lookup surfaces resolver failures", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 503 });
    try {
        const client = await connectClient();
        const result = await client.callTool({
            name: "dns_lookup",
            arguments: { name: "example.com", type: "A" },
        });
        assert.equal(result.isError, true);
        assert.match(
            result.content[0].text,
            /DNS query failed with status 503/,
        );
        await client.close();
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("dns_reverse builds arpa names for IPv4 and IPv6", async () => {
    const dns = stubDns((url) => ({
        Status: 0,
        Question: [{ name: url.searchParams.get("name") }],
        Answer: [
            {
                name: url.searchParams.get("name"),
                type: 12,
                TTL: 60,
                data: "one.one.one.one",
            },
        ],
    }));
    try {
        const client = await connectClient();

        await client.callTool({
            name: "dns_reverse",
            arguments: { address: "1.1.1.1" },
        });
        assert.equal(
            dns.calls[0].searchParams.get("name"),
            "1.1.1.1.in-addr.arpa",
        );
        assert.equal(dns.calls[0].searchParams.get("type"), "PTR");

        const v6 = readText(
            await client.callTool({
                name: "dns_reverse",
                arguments: { address: "2606:4700:4700::1111" },
            }),
        );
        assert.equal(
            dns.calls[1].searchParams.get("name"),
            "1.1.1.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.7.4.0.0.7.4.6.0.6.2.ip6.arpa",
        );
        assert.equal(v6.records[0].type, "PTR");
        assert.equal(v6.records[0].data, "one.one.one.one");
        await client.close();
    } finally {
        dns.restore();
    }
});
