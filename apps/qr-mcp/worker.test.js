import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const QR_PRICE = "0.0001";

function toDataUri(bytes) {
    return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function connect(worker, env) {
    const client = new Client(
        { name: "qr-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://qr.internal"),
        {
            fetch: async (input, init) => {
                const request = new Request(input, init);
                return worker.fetch(request, env);
            },
        },
    );
    await client.connect(transport);
    return client;
}

async function callTool(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    return result;
}

async function callToolError(client, name, args, pattern) {
    const result = await callTool(client, name, args);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, pattern);
    return result;
}

function imageContent(result) {
    return result.content.find(
        (item) => item.type === "image" || item.type === "image/png",
    );
}

function jsonText(result) {
    const text = result.content.find((item) => item.type === "text");
    return JSON.parse(text.text);
}

test("generate_qr returns a PNG image with metadata", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    const result = await callTool(client, "generate_qr", {
        data: "https://pollinations.ai",
    });
    const image = imageContent(result);
    assert.equal(image.mimeType, "image/png");
    const png = Buffer.from(image.data, "base64");
    // PNG signature and IHDR dimensions match the metadata text.
    assert.deepEqual(
        [...png.slice(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    const meta = jsonText(result);
    assert.equal(png.readUInt32BE(16), meta.width);
    assert.equal(png.readUInt32BE(20), meta.height);
    assert.equal(meta.errorCorrection, "M");
    assert.ok(meta.qrVersion >= 1);
    await client.close();
});

test("generate_qr then read_qr round-trips the payload", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    for (const data of [
        "https://gen.pollinations.ai/mcp/qr",
        "WIFI:T:WPA;S:pollinations;P:correct-horse-battery;;",
        "你好世界 pollinations",
        "party 🎉 time",
    ]) {
        const generated = await callTool(client, "generate_qr", { data });
        const read = await callTool(client, "read_qr", {
            image: toDataUri(
                Buffer.from(imageContent(generated).data, "base64"),
            ),
        });
        assert.equal(jsonText(read).data, data);
    }
    await client.close();
});

test("generate_qr honors colors, scale, margin, and error correction", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    const generated = await callTool(client, "generate_qr", {
        data: "https://example.com/branded",
        scale: 4,
        margin: 8,
        error_correction: "H",
        dark_color: "#1a2b4c",
        light_color: "#f5f5f5",
    });
    assert.equal(jsonText(generated).errorCorrection, "H");
    const png = PNG.sync.read(
        Buffer.from(imageContent(generated).data, "base64"),
    );
    // A pixel in the quiet zone must be the light color.
    const quiet = 2 * 4 * 4; // y=0, x=2 modules in (RGBA)
    assert.deepEqual([...png.data.slice(quiet, quiet + 3)], [0xf5, 0xf5, 0xf5]);
    const read = await callTool(client, "read_qr", {
        image: toDataUri(PNG.sync.write(png)),
    });
    assert.equal(jsonText(read).data, "https://example.com/branded");
    await client.close();
});

test("read_qr decodes an HTTPS URL through the injected fetch", async () => {
    let requested = null;
    const worker = createWorker({
        fetchImpl: async (url) => {
            requested = url;
            const generated = await callToolOnWorker(createWorker(), {
                data: "https://example.com/fetched",
            });
            return new Response(
                Buffer.from(imageContent(generated).data, "base64"),
                { status: 200 },
            );
        },
    });
    const client = await connect(worker, {});
    const read = await callTool(client, "read_qr", {
        image: "https://images.example.com/code.png",
    });
    assert.equal(requested.href, "https://images.example.com/code.png");
    assert.equal(jsonText(read).data, "https://example.com/fetched");
    await client.close();
});

async function callToolOnWorker(worker, args) {
    const client = await connect(worker, {});
    const result = await callTool(client, "generate_qr", args);
    await client.close();
    return result;
}

test("read_qr decodes JPEG images and light-on-dark codes", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    const generated = await callTool(client, "generate_qr", {
        data: "https://example.com/jpeg-test",
    });
    const png = PNG.sync.read(
        Buffer.from(imageContent(generated).data, "base64"),
    );

    const jpegBytes = jpeg.encode(
        { data: png.data, width: png.width, height: png.height },
        90,
    ).data;
    const readJpeg = await callTool(client, "read_qr", {
        image: `data:image/jpeg;base64,${jpegBytes.toString("base64")}`,
    });
    assert.equal(jsonText(readJpeg).data, "https://example.com/jpeg-test");

    const inverted = new Uint8ClampedArray(png.data.length);
    for (let i = 0; i < png.data.length; i++) {
        inverted[i] = 255 - png.data[i];
    }
    const invertedPng = new PNG({ width: png.width, height: png.height });
    invertedPng.data = Buffer.from(inverted);
    const readInverted = await callTool(client, "read_qr", {
        image: toDataUri(PNG.sync.write(invertedPng)),
    });
    assert.equal(jsonText(readInverted).data, "https://example.com/jpeg-test");
    await client.close();
});

test("read_qr reports a clear error when no code is visible", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    const blank = new PNG({ width: 64, height: 64 });
    blank.data.fill(255);
    await callToolError(
        client,
        "read_qr",
        { image: toDataUri(PNG.sync.write(blank)) },
        /No QR code found/,
    );
    await client.close();
});

test("read_qr rejects unsupported inputs without charging", async () => {
    const worker = createWorker({
        fetchImpl: async (url) => {
            if (url.href.endsWith("/500.png")) {
                return new Response("boom", { status: 500 });
            }
            return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
    });
    const client = await connect(worker, {});
    await callToolError(
        client,
        "read_qr",
        { image: "http://insecure.example/x.png" },
        /HTTPS URL or a data: URI/,
    );
    await callToolError(
        client,
        "read_qr",
        { image: "https://example.com/not-image" },
        /neither a PNG nor a JPEG/,
    );
    await callToolError(
        client,
        "read_qr",
        { image: "data:text/plain;base64,aGVsbG8=" },
        /Only image data URIs/,
    );
    await callToolError(
        client,
        "read_qr",
        { image: `data:image/png;base64,${"A".repeat(14 * 1024 * 1024)}` },
        /between 1 byte and 10 MiB/,
    );
    await client.close();
});

test("read_qr surfaces upstream fetch failures", async () => {
    const worker = createWorker({
        fetchImpl: async () => new Response("boom", { status: 503 }),
    });
    const client = await connect(worker, {});
    await callToolError(
        client,
        "read_qr",
        { image: "https://example.com/down.png" },
        /HTTP 503/,
    );
    await client.close();
});

test("generate_qr rejects payloads that exceed the QR capacity", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    await callToolError(
        client,
        "generate_qr",
        { data: "x".repeat(4000) },
        /too long/,
    );
    // 2400 bytes fits at L (2953) but not at the default M (2331).
    await callToolError(
        client,
        "generate_qr",
        { data: "y".repeat(2400) },
        /does not fit at error correction M/,
    );
    await callTool(client, "generate_qr", {
        data: "z".repeat(2400),
        error_correction: "L",
    });
    await client.close();
});

test("tools are listed with both directions", async () => {
    const worker = createWorker();
    const client = await connect(worker, {});
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
        "generate_qr",
        "read_qr",
    ]);
    assert.match(tools[0].description, /scannable QR code/);
    await client.close();
});

test("successful tool calls report usage; initialize does not", async () => {
    const worker = createWorker();
    const responses = [];
    const countingWorker = {
        fetch: async (request, env) => {
            const response = await worker.fetch(request, env);
            responses.push(response);
            return response;
        },
    };
    const client = await connect(countingWorker, {});
    await callTool(client, "generate_qr", { data: "tracked" });

    const toolResponse = responses[responses.length - 1];
    assert.equal(toolResponse.headers.get(MCP_USAGE_HEADERS.cost), QR_PRICE);
    assert.equal(
        toolResponse.headers.get(MCP_USAGE_HEADERS.tool),
        "generate_qr",
    );
    assert.equal(toolResponse.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.equal(
        toolResponse.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "qr.tool_call.v1",
    );
    assert.equal(
        toolResponse.headers.get(MCP_USAGE_HEADERS.adjustmentUnits),
        "1",
    );

    const failed = await callTool(client, "read_qr", {
        image: "data:image/png;base64,AAAA",
    });
    assert.equal(failed.isError, true);
    const failedResponse = responses[responses.length - 1];
    assert.equal(failedResponse.headers.get(MCP_USAGE_HEADERS.cost), "0");
    assert.equal(
        failedResponse.headers.get(MCP_USAGE_HEADERS.adjustmentUnits),
        "0",
    );
    assert.match(
        failedResponse.headers.get(MCP_USAGE_HEADERS.error) ?? "",
        /neither a PNG nor a JPEG/,
    );
    await client.close();
});

test("health endpoint and unknown paths", async () => {
    const worker = createWorker();
    const health = await worker.fetch(
        new Request("https://qr.internal/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).name, "qr-mcp");

    const missing = await worker.fetch(new Request("https://qr.internal/nope"));
    assert.equal(missing.status, 404);

    const batch = await worker.fetch(
        new Request("https://qr.internal/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
        }),
    );
    assert.equal(batch.status, 400);
    assert.match(
        (await batch.json()).message,
        /Batch requests are not supported/,
    );
});
