import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { inspectGlb, MAX_GLB_BYTES } from "./inspector.js";
import worker from "./worker.js";

function glb(doc, payload = null) {
    const json = new TextEncoder().encode(JSON.stringify(doc));
    const padded = (json.length + 3) & ~3;
    const binaryLength = payload === null ? 0 : (payload.length + 3) & ~3;
    const length = 12 + 8 + padded + (payload === null ? 0 : 8 + binaryLength);
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, length, true);
    view.setUint32(12, padded, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.fill(0x20, 20, 20 + padded);
    bytes.set(json, 20);
    if (payload !== null) {
        const next = 20 + padded;
        view.setUint32(next, binaryLength, true);
        view.setUint32(next + 4, 0x004e4942, true);
        bytes.set(payload, next + 8);
    }
    return bytes;
}

const BASE = {
    asset: { version: "2.0", generator: "GLB fixture" },
    scenes: [{ nodes: [] }],
    scene: 0,
};
const TRI = {
    asset: { version: "2.0", generator: "Synthetic triangle" },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [
        {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: "VEC3",
            min: [0, 0, 0],
            max: [1, 1, 0],
        },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
};

function localFetch(input, init) {
    return worker.fetch(
        input instanceof Request ? input : new Request(input, init),
    );
}

async function connectClient(token = "sk_fixture", options = {}) {
    const client = new Client(
        { name: "glb-inspector-test", version: "1.0.0" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://glb-inspector-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

test("parses a complete binary triangle without assuming transformed world bounds", () => {
    const report = inspectGlb(glb(TRI, new Uint8Array(36)));
    assert.equal(report.structurallyValid, true, JSON.stringify(report.errors));
    assert.equal(report.selfContained, true);
    assert.equal(report.summary.triangles, 1);
    assert.equal(report.summary.meshes, 1);
    assert.deepEqual(report.declaredLocalBounds.extents, [1, 1, 0]);
    assert.match(report.declaredLocalBounds.note, /mesh-local/);
});

test("accepts a minimal JSON-only GLB", () => {
    const report = inspectGlb(glb(BASE));
    assert.equal(report.structurallyValid, true, JSON.stringify(report.errors));
    assert.equal(report.summary.meshes, 0);
});

test("rejects malformed headers, JSON, chunk length and missing BIN", () => {
    const valid = glb(TRI, new Uint8Array(36));
    const corrupt = (offset, value) => {
        const bytes = valid.slice();
        new DataView(bytes.buffer).setUint32(offset, value, true);
        return bytes;
    };
    for (const bytes of [
        new Uint8Array(),
        corrupt(0, 0),
        corrupt(4, 1),
        corrupt(8, 99),
        corrupt(12, 9999999),
        glb(TRI),
        new Uint8Array(MAX_GLB_BYTES + 1),
    ]) {
        const report = inspectGlb(bytes);
        assert.equal(report.structurallyValid, false);
        assert.ok(report.errors.length);
    }
});

test("rejects invalid references and accessor overrun", () => {
    const cases = [
        {
            ...TRI,
            meshes: [{ primitives: [{ attributes: { POSITION: 22 } }] }],
        },
        { ...TRI, nodes: [{ mesh: 2 }], scenes: [{ nodes: [0] }] },
        { ...TRI, accessors: [{ ...TRI.accessors[0], count: 100 }] },
        {
            ...TRI,
            meshes: [
                {
                    primitives: [
                        { attributes: { POSITION: 0 }, mode: 4, indices: 0 },
                    ],
                },
            ],
        },
    ];
    for (const doc of cases) {
        assert.equal(
            inspectGlb(glb(doc, new Uint8Array(36))).structurallyValid,
            false,
        );
    }
});

test("marks external resources and avoids claiming complete bounds", () => {
    const external = {
        asset: { version: "2.0" },
        buffers: [{ uri: "remote.bin", byteLength: 12 }],
    };
    const report = inspectGlb(glb(external));
    assert.equal(report.structurallyValid, true);
    assert.equal(report.selfContained, false);
    assert.ok(report.warnings.some((s) => s.includes("External resources")));
});

test("health, authorization gate, strict path and JSON-RPC batch rejection", async () => {
    const host = "https://glb-inspector-mcp.pollinations.ai";
    const health = await worker.fetch(new Request(`${host}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
    assert.equal((await worker.fetch(new Request(`${host}/mcp`))).status, 404);
    const unauthorized = await worker.fetch(
        new Request(host, { method: "POST", body: "{}" }),
    );
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate"), /Bearer/);
    const batch = await worker.fetch(
        new Request(host, {
            method: "POST",
            headers: {
                Authorization: "Bearer sk_test",
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(batch.status, 400);
});

test("MCP exposes two tools under modern and legacy protocol", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient("sk_test", options);
        try {
            const tools = (await client.listTools()).tools
                .map((t) => t.name)
                .sort();
            assert.deepEqual(tools, ["inspect_glb", "validate_glb"]);
        } finally {
            await client.close();
        }
    }
});

test("inspects hosted GLB and verifies hashed result without forwarding bearer", async (t) => {
    const original = glb(TRI, new Uint8Array(36));
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        requests++;
        assert.equal(
            String(input),
            "https://media.pollinations.ai/glb/triangle.glb",
        );
        assert.equal(init.redirect, "error");
        assert.equal(new Headers(init.headers).has("authorization"), false);
        return new Response(original, {
            headers: { "content-length": String(original.byteLength) },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_glb",
        arguments: { url: "https://media.pollinations.ai/glb/triangle.glb" },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.summary.triangles, 1);
    assert.equal(report.sha256.length, 64);
    assert.equal(report.structurallyValid, true);
    assert.equal(requests, 1);
});

test("reports policy failures as data, not MCP transport errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(glb(TRI, new Uint8Array(36))),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "validate_glb",
        arguments: {
            url: "https://media.pollinations.ai/a.glb",
            max_triangles: 0,
            max_meshes: 0,
            max_file_bytes: 1,
            require_materials: true,
        },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.passed, false);
    assert.equal(report.violations.length, 4);
});

test("rejects URL-based SSRF and prevents external fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected network request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const url of [
        "http://media.pollinations.ai/a.glb",
        "https://localhost/a.glb",
        "https://media.pollinations.ai.evil.test/a.glb",
        "https://user:pass@media.pollinations.ai/a.glb",
        "https://media.pollinations.ai:444/a.glb",
    ]) {
        const result = await client.callTool({
            name: "inspect_glb",
            arguments: { url },
        });
        assert.equal(result.isError, true, url);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("rejects streaming responses beyond 32 MiB without buffering full content", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(new Uint8Array(MAX_GLB_BYTES + 1)),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_glb",
        arguments: { url: "https://media.pollinations.ai/large.glb" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /32 MiB/);
});

test("fails closed when a triangle budget cannot be verified", async (t) => {
    const draco = {
        asset: { version: "2.0" },
        meshes: [
            {
                primitives: [
                    {
                        attributes: {},
                        mode: 4,
                        extensions: {
                            KHR_draco_mesh_compression: {
                                bufferView: 0,
                                attributes: { POSITION: 0 },
                            },
                        },
                    },
                ],
            },
        ],
    };
    t.mock.method(globalThis, "fetch", async () => new Response(glb(draco)));
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "validate_glb",
        arguments: {
            url: "https://media.pollinations.ai/draco.glb",
            max_triangles: 100,
        },
    });
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.passed, false);
    assert.equal(report.summary.triangleCountComplete, false);
    assert.ok(report.violations.some((v) => v.includes("incomplete")));
});

test("data URI buffers count as self-contained", () => {
    const doc = {
        asset: { version: "2.0" },
        buffers: [
            { uri: "data:application/octet-stream;base64,AAAA", byteLength: 3 },
        ],
    };
    const report = inspectGlb(glb(doc));
    assert.equal(report.structurallyValid, true, JSON.stringify(report.errors));
    assert.equal(report.selfContained, true);
});

test("rejects downloads with an oversized declared content-length", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response("unused", {
                headers: { "content-length": String(MAX_GLB_BYTES + 1) },
            }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_glb",
        arguments: { url: "https://media.pollinations.ai/big.glb" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /32 MiB/);
});

test("malformed buffer references report errors without throwing", () => {
    const doc = {
        asset: { version: "2.0" },
        buffers: [null],
        bufferViews: [{ buffer: 0, byteLength: 8 }],
        scenes: [{}],
    };
    const report = inspectGlb(glb(doc));
    assert.equal(report.structurallyValid, false);
    assert.ok(report.errors.length);
});

test("parser tolerates random truncated and hostile binary inputs", () => {
    let seed = 2701;
    function rand() {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return seed >>> 0;
    }
    for (let i = 0; i < 256; i++) {
        const bytes = new Uint8Array(rand() % 256);
        for (let j = 0; j < bytes.length; j++) bytes[j] = rand() & 255;
        assert.doesNotThrow(() => inspectGlb(bytes), `sample ${i}`);
    }
});
