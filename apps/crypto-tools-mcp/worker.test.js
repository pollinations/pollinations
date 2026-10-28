import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "hash_text",
    "generate_uuid",
    "base64_transform",
    "generate_secure_token",
    "calculate_hmac",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "crypto-tools-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://crypto-tools-mcp.pollinations.ai"),
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
        new Request("https://crypto-tools-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://crypto-tools-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);

    const oldEndpoint = await worker.fetch(
        new Request("https://crypto-tools-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS.slice().sort(),
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS.slice().sort(),
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://crypto-tools-mcp.pollinations.ai", {
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

test("hash_text returns known SHA-256 and MD5", async () => {
    const client = await connectClient();
    try {
        const sha = await client.callTool({
            name: "hash_text",
            arguments: { text: "hello world", algorithm: "sha256" },
        });
        assert.equal(
            sha.content[0].text,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
        );

        const md5 = await client.callTool({
            name: "hash_text",
            arguments: { text: "hello world", algorithm: "md5" },
        });
        assert.equal(md5.content[0].text, "5eb63bbbe01eeed093cb22bb8f5acdc3");
    } finally {
        await client.close();
    }
});

test("generate_uuid returns valid v4 UUID", async () => {
    const client = await connectClient();
    try {
        const res = await client.callTool({
            name: "generate_uuid",
            arguments: {},
        });
        const uuid = res.content[0].text;
        assert.match(
            uuid,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    } finally {
        await client.close();
    }
});

test("base64_transform round-trips UTF-8", async () => {
    const client = await connectClient();
    try {
        const original = "Pollinations Quest Hunter";
        const enc = await client.callTool({
            name: "base64_transform",
            arguments: { text: original, action: "encode" },
        });
        const dec = await client.callTool({
            name: "base64_transform",
            arguments: { text: enc.content[0].text, action: "decode" },
        });
        assert.equal(dec.content[0].text, original);
    } finally {
        await client.close();
    }
});

test("generate_secure_token lengths", async () => {
    const client = await connectClient();
    try {
        const hex = await client.callTool({
            name: "generate_secure_token",
            arguments: { bytes: 16, format: "hex" },
        });
        assert.equal(hex.content[0].text.length, 32);

        const alnum = await client.callTool({
            name: "generate_secure_token",
            arguments: { bytes: 24, format: "alphanumeric" },
        });
        assert.equal(alnum.content[0].text.length, 24);
    } finally {
        await client.close();
    }
});

test("calculate_hmac returns hex digest", async () => {
    const client = await connectClient();
    try {
        const res = await client.callTool({
            name: "calculate_hmac",
            arguments: {
                text: "message-payload",
                secret: "super-secret-key",
                algorithm: "sha256",
            },
        });
        assert.equal(res.content[0].text.length, 64);
    } finally {
        await client.close();
    }
});
