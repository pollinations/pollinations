import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const token = "test-mcp-code-client";
const gen = "https://gen.example";
const endpoint = "https://mcp.internal/";
const seen = [];
let mf;
let client;

before(async () => {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL("./worker.js", import.meta.url))],
        bundle: true,
        write: false,
        format: "esm",
        platform: "neutral",
        mainFields: ["module", "main"],
        conditions: ["workerd", "worker", "browser"],
        external: ["cloudflare:*", "node:*"],
        // Shared handler files live outside this standalone package.
        nodePaths: [fileURLToPath(new URL("./node_modules", import.meta.url))],
    });
    mf = new Miniflare(
        convertV4MiniflareOptions({
            name: "pollinations-code-test",
            modules: true,
            script: bundle.outputFiles[0].text,
            compatibilityDate: "2026-08-14",
            compatibilityFlags: ["nodejs_compat"],
            workerLoaders: { LOADER: {} },
            bindings: { POLLINATIONS_BASE_URL: gen },
            outboundService: async (req) => {
                const url = new URL(req.url);
                seen.push({
                    path: url.pathname,
                    auth: req.headers.get("authorization"),
                });
                assert.equal(url.origin, gen);
                if (url.pathname === "/image/models")
                    return Response.json([{ name: "test-image" }]);
                if (url.pathname === "/v1/images/generations") {
                    const { prompt } = await req.json();
                    if (prompt === "denied")
                        return Response.json(
                            { error: "model unavailable" },
                            { status: 403 },
                        );
                    return Response.json({
                        data: [{ url: `https://media.example/${prompt}.png` }],
                    });
                }
                return new Response(null, { status: 404 });
            },
        }),
    );
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        fetch: (input, init) =>
            mf.dispatchFetch(
                input instanceof Request ? input.url : String(input),
                init,
            ),
        requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    client = new Client({ name: "external-agent-test", version: "1" });
    await client.connect(transport);
});
after(async () => {
    try {
        await client?.close();
    } finally {
        await mf?.dispose();
    }
});

function run(code) {
    return client.callTool({ name: "code", arguments: { code } });
}

function value(result) {
    assert.ok(!result.isError, result.content[0]?.text);
    return JSON.parse(result.content[0].text);
}

test("discovers a single code tool and composes real handlers in an isolated Worker", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map((tool) => tool.name),
        ["code"],
    );
    const start = seen.length;
    const result = await run(`async () => {
        const [model] = await pollinations.listModels({type: 'image'});
        return Promise.all(['one', 'two', 'three'].map(async prompt => {
            const image = await pollinations.generateImage({model: model.name, prompt});
            return {model: model.name, url: image.data[0].url};
        }));
    }`);
    assert.deepEqual(
        value(result),
        ["one", "two", "three"].map((id) => ({
            model: "test-image",
            url: `https://media.example/${id}.png`,
        })),
    );
    assert.ok(
        seen.slice(start).every((call) => call.auth === `Bearer ${token}`),
    );
});

test("counts parallel attempts before dispatch and rejects the fifth", async () => {
    const start = seen.length;
    const result = await run(`async () => {
        const calls = await Promise.allSettled(Array.from({length: 5}, () => pollinations.listModels({type: 'image'})));
        return calls.map(call => call.status);
    }`);
    assert.deepEqual(value(result).sort(), [
        "fulfilled",
        "fulfilled",
        "fulfilled",
        "fulfilled",
        "rejected",
    ]);
    assert.equal(seen.length - start, 4);
});

test("preserves successful siblings and prevents invalid inputs reaching Gen", async () => {
    const start = seen.length;
    const result = await run(`async () => {
        const outcomes = await Promise.allSettled([{prompt:'ok'}, {prompt:'denied'}, {prompt:''}].map(params => pollinations.generateImage(params)));
        return outcomes.map(outcome => outcome.status === 'fulfilled' ? outcome.value.data[0].url : 'failed');
    }`);
    assert.deepEqual(value(result), [
        "https://media.example/ok.png",
        "failed",
        "failed",
    ]);
    assert.equal(seen.length - start, 2);
});

test("sandbox cannot use direct fetch or account tools", async () => {
    const start = seen.length;
    const result = await run(`async () => {
        let blocked = false;
        try { await fetch('${gen}/image/models'); } catch { blocked = true; }
        let denied = false;
        try { await pollinations.getBalance({}); } catch { denied = true; }
        return [blocked, denied];
    }`);
    assert.deepEqual(value(result), [true, true]);
    assert.equal(seen.length, start);
});

test("refuses oversized scripts and JSON results", async () => {
    const oversized = await run(`async () => 1 /*${"a".repeat(16_384)}*/`);
    assert.equal(oversized.isError, true);
    const result = await run(`async () => 'a'.repeat(32_769)`);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Return at most/);
});
