import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["create_qr"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "qrcode-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://qrcode-mcp.pollinations.ai"),
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
        new Request("https://qrcode-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://qrcode-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="qrcode-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://qrcode-mcp.pollinations.ai/mcp"),
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
        new Request("https://qrcode-mcp.pollinations.ai", {
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

test("creates SVG and PNG QR codes for a URL", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: { text: "https://pollinations.ai" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length, 2);
    const [svg, png] = result.content.map((block) => block.text);
    assert.match(svg, /^<svg/);
    assert.ok(svg.includes("http://www.w3.org/2000/svg"));
    assert.match(png, /^data:image\/png;base64,/);
    const bytes = Buffer.from(png.split(",")[1], "base64");
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    await client.close();
});

test("creates SVG only when requested", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: {
            text: "hello world",
            format: "svg",
            error_correction: "high",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length, 1);
    assert.match(result.content[0].text, /^<svg/);
    await client.close();
});

test("creates PNG at the requested size", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: {
            text: "size check",
            format: "png",
            size: 256,
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length, 1);
    const bytes = Buffer.from(
        result.content[0].text.split(",")[1],
        "base64",
    );
    // PNG IHDR width, bytes 16-19.
    assert.equal(bytes.readUInt32BE(16), 256);
    await client.close();
});

test("rejects empty text with a clear error", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: { text: "" },
    });
    assert.equal(result.isError, true);
    assert.match(
        result.content[0].text,
        /QR creation failed: text is empty/,
    );
    await client.close();
});

test("rejects text beyond the capacity of the error correction level", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: {
            text: "a".repeat(3000),
            error_correction: "high",
        },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /holds at most 1273/);
    await client.close();
});

test("accepts text within byte capacity and handles unicode", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "create_qr",
        arguments: {
            text: "שלום pollinations 🌸",
            format: "svg",
        },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /^<svg/);
    await client.close();
});
