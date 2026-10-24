import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["inspect_image"];
const ORIGIN = "https://image-inspect-mcp.pollinations.ai";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "image-inspect-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(new URL(ORIGIN), {
        fetch: localFetch,
        requestInit: {
            headers: { Authorization: `Bearer ${token}` },
        },
    });
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="image-inspect-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(new Request(`${ORIGIN}/mcp`));
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
    assert.equal(response.status, 400);
});

function bytes(value) {
    return new Uint8Array(value);
}

function be32(value) {
    return [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ];
}

function le32(value) {
    return [
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
    ];
}

function le16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
}

function be16(value) {
    return [(value >>> 8) & 0xff, value & 0xff];
}

function pngBytes(width, height, bitDepth = 8, colorType = 6) {
    return bytes([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a, // signature
        0x00,
        0x00,
        0x00,
        0x0d, // IHDR length
        0x49,
        0x48,
        0x44,
        0x52, // "IHDR"
        ...be32(width),
        ...be32(height),
        bitDepth,
        colorType,
        0x00, // compression
        0x00, // filter
        0x00, // interlace
        0x00,
        0x00,
        0x00,
        0x00, // CRC placeholder
    ]);
}

function jpegBytes(width, height, { progressive = false } = {}) {
    const sof = progressive ? 0xc2 : 0xc0;
    return bytes([
        0xff,
        0xd8, // SOI
        0xff,
        0xe0,
        0x00,
        0x10, // APP0, length 16
        0x4a,
        0x46,
        0x49,
        0x46,
        0x00, // "JFIF\0"
        0x01,
        0x01,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0xff,
        sof,
        0x00,
        0x0b, // SOF, length 11 (1 component)
        0x08, // precision
        ...be16(height),
        ...be16(width),
        0x01, // components
        0x01,
        0x11,
        0x00, // component spec
        0xff,
        0xd9, // EOI
    ]);
}

function gifBytes(width, height, { version = "89a", packed = 0x87 } = {}) {
    return bytes([
        0x47,
        0x49,
        0x46, // "GIF"
        ...version.split("").map((char) => char.charCodeAt(0)),
        ...le16(width),
        ...le16(height),
        packed,
        0x00, // background index
        0x00, // pixel aspect
    ]);
}

function webpBytes(chunk, payload) {
    return bytes([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        ...le32(4 + 8 + payload.length),
        0x57,
        0x45,
        0x42,
        0x50, // "WEBP"
        ...chunk.split("").map((char) => char.charCodeAt(0)),
        ...le32(payload.length),
        ...payload,
    ]);
}

function webpLossyBytes(width, height) {
    return webpBytes("VP8 ", [
        0x00,
        0x00,
        0x00, // frame tag
        0x9d,
        0x01,
        0x2a, // start code
        ...le16(width & 0x3fff),
        ...le16(height & 0x3fff),
    ]);
}

function webpLosslessBytes(width, height) {
    const w = width - 1;
    const h = height - 1;
    return webpBytes("VP8L", [
        0x2f, // signature
        w & 0xff,
        ((w >> 8) & 0x3f) | ((h & 0x3) << 6),
        (h >> 2) & 0xff,
        (h >> 10) & 0x0f,
    ]);
}

function webpExtendedBytes(width, height, flags = 0) {
    const w = width - 1;
    const h = height - 1;
    return webpBytes("VP8X", [flags, 0x00, 0x00, 0x00, ...le24(w), ...le24(h)]);
}

function le24(value) {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function bmpBytes(width, height, { bpp = 24 } = {}) {
    return bytes([
        0x42,
        0x4d, // "BM"
        ...le32(54),
        ...le32(0), // reserved
        ...le32(54), // pixel data offset
        ...le32(40), // DIB header size
        ...le32(width),
        ...le32(height),
        ...le16(1), // planes
        ...le16(bpp),
    ]);
}

async function inspect(url) {
    const client = await connectClient();
    try {
        const result = await client.callTool({
            name: "inspect_image",
            arguments: { url },
        });
        assert.notEqual(result.isError, true);
        return JSON.parse(result.content[0].text);
    } finally {
        await client.close();
    }
}

test("reports PNG headers plus origin cache headers", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://cdn.test/cat.png");
        return new Response(pngBytes(1024, 768, 8, 6), {
            headers: {
                "content-type": "image/png",
                etag: '"v1"',
                "x-cache": "HIT",
                "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
            },
        });
    });
    assert.deepEqual(await inspect("https://cdn.test/cat.png"), {
        source: "https://cdn.test/cat.png",
        status: 200,
        bytes: 33,
        truncated: false,
        contentType: "image/png",
        etag: '"v1"',
        xCache: "HIT",
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        format: "png",
        width: 1024,
        height: 768,
        details: { bitDepth: 8, colorType: "rgba", interlaced: false },
    });
});

test("reads baseline and progressive JPEG frame headers", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        return url.pathname === "/progressive.jpg"
            ? new Response(jpegBytes(1920, 1080, { progressive: true }))
            : new Response(jpegBytes(640, 480));
    });

    const baseline = await inspect("https://cdn.test/base.jpg");
    assert.equal(baseline.format, "jpeg");
    assert.equal(baseline.width, 640);
    assert.equal(baseline.height, 480);
    assert.deepEqual(baseline.details, {
        progressive: false,
        precision: 8,
        components: 1,
    });

    const progressive = await inspect("https://cdn.test/progressive.jpg");
    assert.equal(progressive.details.progressive, true);
    assert.equal(progressive.width, 1920);
    assert.equal(progressive.height, 1080);
});

test("reads GIF, every WebP flavor and BMP headers", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const path = new URL(String(input)).pathname;
        const bodies = {
            "/a.gif": gifBytes(320, 200),
            "/lossy.webp": webpLossyBytes(800, 600),
            "/lossless.webp": webpLosslessBytes(1024, 768),
            "/extended.webp": webpExtendedBytes(4096, 2160, 0x12),
            "/a.bmp": bmpBytes(640, 480),
            "/down.bmp": bmpBytes(320, -320),
        };
        return bodies[path]
            ? new Response(bodies[path])
            : new Response(null, { status: 404 });
    });

    const gif = await inspect("https://cdn.test/a.gif");
    assert.deepEqual(
        {
            format: gif.format,
            width: gif.width,
            height: gif.height,
            ...gif.details,
        },
        {
            format: "gif",
            width: 320,
            height: 200,
            version: "89a",
            hasGlobalColorTable: true,
            globalColorTableSize: 256,
        },
    );

    const lossy = await inspect("https://cdn.test/lossy.webp");
    assert.deepEqual(
        {
            format: lossy.format,
            width: lossy.width,
            height: lossy.height,
            ...lossy.details,
        },
        { format: "webp", width: 800, height: 600, flavor: "lossy" },
    );

    const lossless = await inspect("https://cdn.test/lossless.webp");
    assert.deepEqual(
        {
            format: lossless.format,
            width: lossless.width,
            height: lossless.height,
            ...lossless.details,
        },
        { format: "webp", width: 1024, height: 768, flavor: "lossless" },
    );

    const extended = await inspect("https://cdn.test/extended.webp");
    assert.deepEqual(
        {
            format: extended.format,
            width: extended.width,
            height: extended.height,
            ...extended.details,
        },
        {
            format: "webp",
            width: 4096,
            height: 2160,
            flavor: "extended",
            animated: true,
            hasAlpha: true,
        },
    );

    const bmp = await inspect("https://cdn.test/a.bmp");
    assert.deepEqual(
        {
            format: bmp.format,
            width: bmp.width,
            height: bmp.height,
            ...bmp.details,
        },
        { format: "bmp", width: 640, height: 480, bpp: 24, topDown: false },
    );

    const down = await inspect("https://cdn.test/down.bmp");
    assert.equal(down.height, 320);
    assert.equal(down.details.topDown, true);
});

test("inspects base64 data URIs without fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for data URI");
    });
    const dataUri = `data:image/png;base64,${Buffer.from(pngBytes(16, 16)).toString("base64")}`;
    assert.deepEqual(await inspect(dataUri), {
        source: "data URI",
        bytes: 33,
        truncated: false,
        format: "png",
        width: 16,
        height: 16,
        details: { bitDepth: 8, colorType: "rgba", interlaced: false },
    });
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("reports non-image bytes and missing responses as format null", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/missing.png") {
            return new Response(null, { status: 404 });
        }
        return new Response("hello world", {
            headers: { "content-type": "text/plain" },
        });
    });

    const text = await inspect("https://cdn.test/notes.txt");
    assert.deepEqual(text, {
        source: "https://cdn.test/notes.txt",
        status: 200,
        bytes: 11,
        truncated: false,
        contentType: "text/plain",
        format: null,
        width: null,
        height: null,
    });

    const missing = await inspect("https://cdn.test/missing.png");
    assert.deepEqual(missing, {
        source: "https://cdn.test/missing.png",
        status: 404,
        bytes: 0,
        truncated: false,
        format: null,
        width: null,
        height: null,
    });
});

test("rejects unsupported inputs before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const ftp = await client.callTool({
        name: "inspect_image",
        arguments: { url: "ftp://files.example.com/cat.png" },
    });
    assert.equal(ftp.isError, true);
    assert.match(ftp.content[0].text, /Only http and https/);

    const plainDataUri = await client.callTool({
        name: "inspect_image",
        arguments: { url: "data:image/png,rawtext" },
    });
    assert.equal(plainDataUri.isError, true);
    assert.match(plainDataUri.content[0].text, /base64 data URIs/);

    const badBase64 = await client.callTool({
        name: "inspect_image",
        arguments: { url: "data:image/png;base64,@@@@" },
    });
    assert.equal(badBase64.isError, true);
    assert.match(badBase64.content[0].text, /not valid base64/);

    assert.equal(fetchMock.mock.callCount(), 0);
});

test("surfaces network failures instead of tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    assert.deepEqual(await inspect("https://down.test/pic.png"), {
        source: "https://down.test/pic.png",
        status: null,
        error: "fetch failed",
        bytes: 0,
        truncated: false,
        format: null,
        width: null,
        height: null,
    });
});
