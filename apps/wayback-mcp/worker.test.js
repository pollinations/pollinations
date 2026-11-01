import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://wayback-mcp.pollinations.ai";
const TOKEN = "sk_test";

const CDX_TABLE = JSON.stringify([
    [
        "urlkey",
        "timestamp",
        "original",
        "mimetype",
        "statuscode",
        "digest",
        "length",
    ],
    [
        "com,example)/",
        "20240101000832",
        "https://www.example.com/",
        "text/html",
        "200",
        "JI6OR3QR4CI526JD6TMMNZNV4QPMPQCH",
        "778",
    ],
    [
        "com,example)/",
        "20250601120000",
        "https://www.example.com/",
        "text/html",
        "200",
        "JI6OR3QR4CI526JD6TMMNZNV4QPMPQD",
        "810",
    ],
]);

const CDX_ONE = JSON.stringify([
    [
        "urlkey",
        "timestamp",
        "original",
        "mimetype",
        "statuscode",
        "digest",
        "length",
    ],
    [
        "com,example)/",
        "20020120142510",
        "http://example.com:80/",
        "text/html",
        "200",
        "ABC",
        "778",
    ],
]);

const PAGE_HTML = `<!doctype html>
<html><head><title>Example & Co</title>
<style>body { color: red }</style>
<script>if (1 < 2) { console.log("<b>not text</b>") }</script>
</head>
<body><!-- comment -->
<h1>Hello</h1>
<p>World &lt;3 &#39;quotes&#39; & more &#x2603;</p>
</body></html>`;

async function connectClient(options = {}) {
    const client = new Client(
        { name: "wayback-mcp-worker-test", version: "0.0.1" },
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
            'Bearer realm="wayback-mcp.pollinations.ai"',
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

test("exposes two read-only tools over modern and legacy stateless HTTP", async () => {
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
                ["wayback_snapshots", "wayback_page"],
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("lists snapshots without forwarding caller credentials", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://web.archive.org");
        assert.equal(url.pathname, "/cdx/search/cdx");
        assert.deepEqual(
            [...url.searchParams.keys()],
            ["url", "output", "fl", "limit"],
        );
        assert.equal(url.searchParams.get("url"), "https://www.example.com/");
        assert.equal(url.searchParams.get("output"), "json");
        assert.equal(
            url.searchParams.get("fl"),
            "timestamp,original,statuscode,mimetype",
        );
        assert.equal(url.searchParams.get("limit"), "2");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(CDX_TABLE);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "wayback_snapshots",
        arguments: { url: "https://www.example.com/", limit: 2 },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        url: "https://www.example.com/",
        snapshots: [
            {
                timestamp: "20240101000832",
                url: "https://www.example.com/",
                status: "200",
                type: "text/html",
            },
            {
                timestamp: "20250601120000",
                url: "https://www.example.com/",
                status: "200",
                type: "text/html",
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("passes matchType and range filters to the CDX API", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.deepEqual(
            [...url.searchParams.keys()],
            ["url", "output", "fl", "limit", "matchType", "from", "to"],
        );
        assert.equal(url.searchParams.get("matchType"), "prefix");
        assert.equal(url.searchParams.get("from"), "2020");
        assert.equal(url.searchParams.get("to"), "20250101");
        return new Response(CDX_TABLE);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "wayback_snapshots",
        arguments: {
            url: "https://www.example.com/",
            matchType: "prefix",
            from: "2020",
            to: "20250101",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(upstream.mock.callCount(), 1);
});

test("reads the latest snapshot at or before a timestamp without credentials", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        if (url.pathname === "/cdx/search/cdx") {
            assert.deepEqual(
                [...url.searchParams.keys()],
                ["url", "output", "fl", "limit", "to"],
            );
            assert.equal(
                url.searchParams.get("url"),
                "https://www.example.com/",
            );
            assert.equal(url.searchParams.get("limit"), "-1");
            assert.equal(url.searchParams.get("to"), "2020");
            return new Response(CDX_ONE);
        }
        assert.equal(
            url.href,
            "https://web.archive.org/web/20020120142510id_/http://example.com:80/",
        );
        return new Response(PAGE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "wayback_page",
        arguments: { url: "https://www.example.com/", timestamp: "2020" },
    });
    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.deepEqual(
        { ...payload, text: undefined },
        {
            url: "https://www.example.com/",
            timestamp: "20020120142510",
            status: "200",
            snapshotUrl:
                "https://web.archive.org/web/20020120142510id_/http://example.com:80/",
            textLength: payload.text.length,
            truncated: false,
            text: undefined,
        },
    );
    assert.equal(
        payload.text,
        "Example & Co Hello World <3 'quotes' & more \u2603",
    );
    assert.equal(upstream.mock.callCount(), 2);
});

test("truncates long plain-text snapshots", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        if (new URL(input).pathname === "/cdx/search/cdx") {
            return new Response(CDX_ONE);
        }
        return new Response("a".repeat(16000), {
            headers: { "Content-Type": "text/plain" },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "wayback_page",
        arguments: { url: "https://www.example.com/" },
    });
    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.truncated, true);
    assert.equal(payload.textLength, 15000);
    assert.equal(payload.text.length, 15000);
});

test("reports missing, non-text and upstream failures as tool errors", async (t) => {
    let kind;
    t.mock.method(globalThis, "fetch", async (input) => {
        if (new URL(input).pathname === "/cdx/search/cdx") {
            if (kind === "missing") {
                return new Response(
                    JSON.stringify([
                        [
                            "urlkey",
                            "timestamp",
                            "original",
                            "mimetype",
                            "statuscode",
                            "digest",
                            "length",
                        ],
                    ]),
                );
            }
            if (kind === "503") return new Response(null, { status: 503 });
            if (kind === "html") {
                return new Response("<html>rate limited</html>");
            }
            if (kind === "error") throw new Error("Network unavailable");
            if (kind === "timeout") {
                throw new DOMException(
                    "Wayback lookup timed out",
                    "TimeoutError",
                );
            }
            return new Response(CDX_ONE);
        }
        if (kind === "pdf") {
            return new Response("archived pdf", {
                headers: { "Content-Type": "application/pdf" },
            });
        }
        throw new Error(`Unexpected fetch for kind ${kind}`);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const scenarios = [
        ["missing", "wayback_page", /No Wayback Machine snapshot found/],
        ["pdf", "wayback_page", /only text snapshots/],
        ["503", "wayback_snapshots", /HTTP 503/],
        ["html", "wayback_snapshots", /CDX JSON table/],
        ["error", "wayback_snapshots", /Network unavailable/],
        ["timeout", "wayback_snapshots", /timed out/],
    ];
    for (const [nextKind, tool, message] of scenarios) {
        kind = nextKind;
        const result = await client.callTool({
            name: tool,
            arguments: { url: "https://www.example.com/" },
        });
        assert.equal(result.isError, true, String(nextKind));
        assert.match(result.content[0].text, message);
    }
});

test("rejects invalid arguments before querying the Wayback Machine", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected Wayback request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["wayback_snapshots", {}],
        ["wayback_snapshots", { url: "ftp://example.com" }],
        [
            "wayback_snapshots",
            { url: "https://web.archive.org/web/1/https://x" },
        ],
        ["wayback_snapshots", { url: "https://archive.org/details/x" }],
        ["wayback_snapshots", { url: "https://example.com", limit: 0 }],
        ["wayback_snapshots", { url: "https://example.com", limit: 51 }],
        [
            "wayback_snapshots",
            { url: "https://example.com", from: "2020-01-01" },
        ],
        [
            "wayback_snapshots",
            { url: "https://example.com", matchType: "wildcard" },
        ],
        ["wayback_page", {}],
        ["wayback_page", { url: "https://example.com", timestamp: "soon" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, JSON.stringify([name, args]));
    }
    assert.equal(upstream.mock.callCount(), 0);
});
