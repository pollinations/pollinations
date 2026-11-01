import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://feeds-mcp.pollinations.ai";
const TOKEN = "sk_test";

const AMP = String.fromCharCode(38);

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
    <channel>
        <title><![CDATA[BBC News]]></title>
        <link>https://www.bbc.co.uk/news</link>
        <description><![CDATA[Top stories ${AMP}#39;today${AMP}#39;]]></description>
        <lastBuildDate>Sat, 17 Oct 2026 09:00:00 GMT</lastBuildDate>
        <item>
            <title>First & foremost: a story</title>
            <link>https://www.bbc.co.uk/news/one</link>
            <guid>one</guid>
            <pubDate>Sat, 17 Oct 2026 08:30:00 GMT</pubDate>
            <description><![CDATA[Body with <b>bold</b> text and an <a href="x">link</a>.]]></description>
        </item>
        <item>
            <title>Second story</title>
            <link>https://www.bbc.co.uk/news/two</link>
            <pubDate>Sat, 17 Oct 2026 07:00:00 GMT</pubDate>
            <description>Plain summary.</description>
        </item>
    </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Example Blog</title>
    <link href="https://example.com/"/>
    <link rel="self" href="https://example.com/feed.atom"/>
    <subtitle> ${AMP}#x2603; posts about weather </subtitle>
    <updated>2026-10-16T18:30:02Z</updated>
    <entry>
        <title>Self-driving cars</title>
        <link rel="alternate" href="https://example.com/2026/10/cars"/>
        <id>tag:example.com,2026:1</id>
        <updated>2026-10-16T18:30:02Z</updated>
        <summary>HTML-Escaped summary: 1 &lt; 2 &amp; more <b>bold</b> text here</summary>
    </entry>
    <entry>
        <title>Second post</title>
        <link href="https://example.com/2026/10/second"/>
        <updated>2026-10-15T10:00:00Z</updated>
        <content type="html">Full content fallback <i>here</i>.</content>
    </entry>
</feed>`;

async function connectClient(options = {}) {
    const client = new Client(
        { name: "feeds-mcp-worker-test", version: "0.0.1" },
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
            'Bearer realm="feeds-mcp.pollinations.ai"',
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

test("exposes a read-only feed_read tool over modern and legacy stateless HTTP", async () => {
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
                ["feed_read"],
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("reads an RSS feed without forwarding caller credentials", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.href, "https://feeds.example/news/rss.xml");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(RSS_FEED, {
            headers: { "Content-Type": "application/rss+xml" },
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "feed_read",
        arguments: { url: "https://feeds.example/news/rss.xml" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        type: "rss",
        feed: {
            title: "BBC News",
            link: "https://www.bbc.co.uk/news",
            description: "Top stories 'today'",
        },
        entries: [
            {
                title: "First & foremost: a story",
                link: "https://www.bbc.co.uk/news/one",
                published: "Sat, 17 Oct 2026 08:30:00 GMT",
                summary: "Body with bold text and an link.",
                truncated: false,
            },
            {
                title: "Second story",
                link: "https://www.bbc.co.uk/news/two",
                published: "Sat, 17 Oct 2026 07:00:00 GMT",
                summary: "Plain summary.",
                truncated: false,
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("reads an Atom feed, falls back to content and honours limit", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(ATOM_FEED, {
                headers: { "Content-Type": "application/atom+xml" },
            }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "feed_read",
        arguments: { url: "https://example.com/feed.atom", limit: 1 },
    });
    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.type, "atom");
    assert.deepEqual(payload.feed, {
        title: "Example Blog",
        link: "https://example.com/",
        description: "\u2603 posts about weather",
    });
    assert.equal(payload.entries.length, 1);
    assert.deepEqual(payload.entries[0], {
        title: "Self-driving cars",
        link: "https://example.com/2026/10/cars",
        published: "2026-10-16T18:30:02Z",
        summary: "HTML-Escaped summary: 1 < 2 & more bold text here",
        truncated: false,
    });
});

test("truncates long summaries", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(
                RSS_FEED.replace(
                    "<description>Plain summary.</description>",
                    `<description>${"x".repeat(600)}</description>`,
                ),
            ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "feed_read",
        arguments: { url: "https://feeds.example/news/rss.xml" },
    });
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.entries[1].summary.length, 500);
    assert.equal(payload.entries[1].truncated, true);
});

test("reports non-feed, HTTP and network failures as tool errors", async (t) => {
    let failure;
    t.mock.method(globalThis, "fetch", async () => {
        if (failure instanceof Error) throw failure;
        return failure;
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [response, message] of [
        [new Response("<html>login page</html>"), /not an RSS or Atom feed/],
        [
            new Response("binary", {
                headers: { "Content-Type": "application/pdf" },
            }),
            /not an RSS or Atom feed/,
        ],
        [new Response(null, { status: 404 }), /HTTP 404/],
        [new Error("Network unavailable"), /Network unavailable/],
        [new DOMException("Feed fetch timed out", "TimeoutError"), /timed out/],
    ]) {
        failure = response;
        const result = await client.callTool({
            name: "feed_read",
            arguments: { url: "https://feeds.example/news/rss.xml" },
        });
        assert.equal(result.isError, true, message);
        assert.match(result.content[0].text, message);
    }
});

test("rejects invalid arguments before fetching", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected feed request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["feed_read", {}],
        ["feed_read", { url: "ftp://example.com/feed" }],
        ["feed_read", { url: "not a url" }],
        ["feed_read", { url: "https://example.com/feed", limit: 0 }],
        ["feed_read", { url: "https://example.com/feed", limit: 51 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, JSON.stringify([name, args]));
    }
    assert.equal(upstream.mock.callCount(), 0);
});
