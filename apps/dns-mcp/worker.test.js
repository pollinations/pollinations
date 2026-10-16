import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://dns-mcp.pollinations.ai";
const TOKEN = "sk_test_request_scoped";

async function connectClient(options = {}) {
    const client = new Client(
        { name: "dns-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(ORIGIN), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
            requestInit: {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    Cookie: "session=private",
                },
            },
        }),
    );
    return client;
}

test("serves health, requires bearer auth and rejects unknown paths and batches", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).stateless, true);
    for (const authorization of [null, "Basic abc", "Bearer", "Bearer a b"]) {
        const headers = authorization ? { authorization } : {};
        const response = await worker.fetch(new Request(ORIGIN, { headers }));
        assert.equal(response.status, 401);
        assert.equal(
            response.headers.get("www-authenticate"),
            'Bearer realm="dns-mcp.pollinations.ai"',
        );
    }
    assert.equal(
        (await worker.fetch(new Request(`${ORIGIN}/other`))).status,
        404,
    );
    const batch = await worker.fetch(
        new Request(ORIGIN, {
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
    assert.equal(batch.status, 400);
});

test("exposes one read-only tool over modern and legacy stateless HTTP", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        try {
            assert.equal(
                client.getProtocolEra(),
                options.versionNegotiation ? "modern" : "legacy",
            );
            const { tools } = await client.listTools();
            assert.deepEqual(
                tools.map(({ name }) => name),
                ["dns_lookup"],
            );
            assert.equal(tools[0].annotations.readOnlyHint, true);
        } finally {
            await client.close();
        }
    }
});

test("queries a fixed resolver without forwarding caller credentials and preserves DNS data", async (t) => {
    const answer = {
        Status: 0,
        TC: false,
        RD: true,
        RA: true,
        AD: true,
        CD: false,
        Question: [{ name: "_dmarc.example.com.", type: 16 }],
        Answer: [
            {
                name: "_dmarc.example.com.",
                type: 16,
                TTL: 300,
                data: '"v=DMARC1; p=reject"',
            },
        ],
        Authority: [
            {
                name: "example.com.",
                type: 2,
                TTL: 3600,
                data: "ns.example.com.",
            },
        ],
    };
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://cloudflare-dns.com");
        assert.equal(url.pathname, "/dns-query");
        assert.equal(url.searchParams.get("name"), "_dmarc.example.com.");
        assert.equal(url.searchParams.get("type"), "TXT");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("accept"), "application/dns-json");
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.equal(init.redirect, "manual");
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json(answer);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "dns_lookup",
        arguments: { name: "_dmarc.example.com.", type: "txt" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), answer);
    assert.equal(upstream.mock.callCount(), 1);
});

test("preserves NXDOMAIN, SERVFAIL and NOERROR without answers", async (t) => {
    const names = [];
    const types = [];
    let answer;
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        names.push(url.searchParams.get("name"));
        types.push(url.searchParams.get("type"));
        assert.equal([...url.searchParams.keys()].join(","), "name,type");
        return Response.json(answer);
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const status of [0, 2, 3]) {
        answer = {
            Status: status,
            AD: false,
            Authority: [{ name: ".", type: 6, TTL: 86400, data: "root SOA" }],
        };
        const result = await client.callTool({
            name: "dns_lookup",
            arguments: {
                name: "example.invalid&cd=1",
                ...(status === 3 ? { type: "257" } : {}),
            },
        });
        assert.notEqual(result.isError, true);
        assert.deepEqual(JSON.parse(result.content[0].text), answer);
    }
    assert.deepEqual(names, Array(3).fill("example.invalid&cd=1"));
    assert.deepEqual(types, ["A", "A", "257"]);
});

test("rejects missing, empty and oversized arguments before calling the resolver", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected upstream request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const args of [
        {},
        { name: " " },
        { name: "a".repeat(255) },
        { name: "example.com", type: "" },
        { name: "example.com", type: 1 },
    ]) {
        const result = await client.callTool({
            name: "dns_lookup",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(upstream.mock.callCount(), 0);
});

test("reports HTTP, network, timeout and malformed JSON failures as tool errors", async (t) => {
    let failure;
    t.mock.method(globalThis, "fetch", async () => {
        if (failure instanceof Error) throw failure;
        return failure;
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [response, message] of [
        [
            new Response(null, {
                status: 302,
                headers: { Location: "https://example.com" },
            }),
            /HTTP 302/,
        ],
        [new Response("rate limited", { status: 429 }), /HTTP 429/],
        [new Response("unavailable", { status: 503 }), /HTTP 503/],
        [new Error("Network unavailable"), /Network unavailable/],
        [new DOMException("DNS lookup timed out", "TimeoutError"), /timed out/],
        [new Response("not json"), /JSON|Unexpected token/],
    ]) {
        failure = response;
        const result = await client.callTool({
            name: "dns_lookup",
            arguments: { name: "example.com" },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, message);
    }
});
