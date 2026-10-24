import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["inspect_site", "inspect_sitemap"];
const ORIGIN = "https://example.com";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "site-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://site-mcp.pollinations.ai"),
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
        new Request("https://site-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://site-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="site-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://site-mcp.pollinations.ai/mcp"),
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
        new Request("https://site-mcp.pollinations.ai", {
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

const ROBOTS = [
    "User-agent: *",
    "Allow: /",
    "User-agent: GPTBot",
    "Disallow: /",
    "Sitemap: https://example.com/sitemap.xml",
].join("\n");
const LLMS = [
    "# Example",
    "",
    "- [Docs](https://example.com/docs)",
    "- [Blog](https://example.com/blog)",
].join("\n");

function respond(path) {
    if (path === "/") return new Response("<html>ok</html>");
    if (path === "/robots.txt") return new Response(ROBOTS);
    if (path === "/llms.txt") return new Response(LLMS);
    if (path === "/.well-known/security.txt") {
        return new Response("Contact: mailto:security@example.com");
    }
    if (path === "/sitemap.xml") return new Response(URLSET);
    return new Response(null, { status: 404 });
}

test("reports crawler policies, llms.txt and well-known documents", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) =>
        respond(String(input).replace(ORIGIN, "")),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_site",
        arguments: { url: `${ORIGIN}/landing?x=1#frag` },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.origin, ORIGIN);
    assert.deepEqual(report.homepage, { status: 200 });
    assert.deepEqual(report.robots.sitemaps, [
        "https://example.com/sitemap.xml",
    ]);
    assert.deepEqual(report.robots.bots.GPTBot, {
        source: "group",
        blocked: true,
        rules: ["Disallow: /"],
    });
    assert.deepEqual(report.robots.bots.ClaudeBot, {
        source: "wildcard",
        blocked: false,
        rules: ["Allow: /"],
    });
    assert.deepEqual(report.llms, {
        status: 200,
        truncated: false,
        title: "Example",
        links: 2,
    });
    assert.deepEqual(report.defaultSitemap, { status: 200 });
    assert.deepEqual(
        report.wellKnown.map(({ path, status }) => `${path}:${status}`),
        [
            "/.well-known/agent-card.json:404",
            "/.well-known/oauth-protected-resource:404",
            "/.well-known/oauth-authorization-server:404",
            "/.well-known/security.txt:200",
            "/.well-known/llms.txt:404",
        ],
    );
});

test("reports missing robots and llms files as 404", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(null, { status: 404 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_site",
        arguments: { url: "https://bare.test" },
    });
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.robots, { status: 404 });
    assert.deepEqual(report.llms, { status: 404 });
});

test("applies longest-match and allow-wins robots precedence", async (t) => {
    const robotsByHost = {
        "most-specific.test": [
            "User-agent: *",
            "Disallow: /",
            "Allow: /public",
        ],
        "tie-wins.test": ["User-agent: *", "Allow: /", "Disallow: /"],
    };
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.hostname in robotsByHost && url.pathname === "/robots.txt") {
            return new Response(robotsByHost[url.hostname].join("\n"));
        }
        return new Response(null, { status: 404 });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const specific = await client.callTool({
        name: "inspect_site",
        arguments: { url: "https://most-specific.test" },
    });
    const specificReport = JSON.parse(specific.content[0].text);
    assert.equal(specificReport.robots.bots.ClaudeBot.blocked, true);

    const tie = await client.callTool({
        name: "inspect_site",
        arguments: { url: "https://tie-wins.test" },
    });
    const tieReport = JSON.parse(tie.content[0].text);
    assert.equal(tieReport.robots.bots.ClaudeBot.blocked, false);
});

const URLSET = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "<url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>",
    "<url><loc>https://example.com/b</loc></url>",
    "<url><loc>https://example.com/c</loc></url>",
    "</urlset>",
].join("");

test("reads a urlset with lastmod and honors the entry limit", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://example.com/sitemap.xml");
        return new Response(URLSET);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_sitemap",
        arguments: { url: ORIGIN },
    });
    assert.deepEqual(JSON.parse(result.content[0].text), {
        url: "https://example.com/sitemap.xml",
        status: 200,
        type: "urlset",
        urlCount: 3,
        entries: [
            { loc: "https://example.com/a", lastmod: "2026-01-01" },
            { loc: "https://example.com/b" },
            { loc: "https://example.com/c" },
        ],
    });

    const limited = await client.callTool({
        name: "inspect_sitemap",
        arguments: { url: ORIGIN, limit: 1 },
    });
    assert.equal(JSON.parse(limited.content[0].text).entries.length, 1);
});

const SITEMAP_INDEX = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "<sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>",
    "<sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap>",
    "</sitemapindex>",
].join("");

test("follows a sitemap index and aggregates child entries", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = String(input);
        if (url === "https://example.com/sitemap-index.xml") {
            return new Response(SITEMAP_INDEX);
        }
        if (url === "https://example.com/sitemap-a.xml")
            return new Response(URLSET);
        return new Response(null, { status: 404 });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_sitemap",
        arguments: { url: "https://example.com/sitemap-index.xml" },
    });
    assert.deepEqual(JSON.parse(result.content[0].text), {
        url: "https://example.com/sitemap-index.xml",
        status: 200,
        type: "sitemapindex",
        sitemaps: [
            { loc: "https://example.com/sitemap-a.xml", status: 200 },
            { loc: "https://example.com/sitemap-b.xml", status: 404 },
        ],
        urlCount: 3,
        entries: [
            { loc: "https://example.com/a", lastmod: "2026-01-01" },
            { loc: "https://example.com/b" },
            { loc: "https://example.com/c" },
        ],
    });
});

test("rejects non-http URLs before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_site",
        arguments: { url: "ftp://files.example.com" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Only http and https/);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("surfaces network failures per URL instead of failing the report", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "inspect_site",
        arguments: { url: "https://down.test" },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.homepage, { status: null, error: "fetch failed" });
    assert.deepEqual(report.robots, { status: null, error: "fetch failed" });
});
