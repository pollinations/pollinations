import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { getText } from "./fetch.js";
import { parseFeed } from "./tools/feeds.js";
import worker from "./worker.js";

async function client(options = {}) {
    const connection = new Client({ name: "test", version: "1.0.0" }, options);
    await connection.connect(
        new StreamableHTTPClientTransport(new URL("https://news.invalid/"), {
            fetch: (input, init) => worker.fetch(new Request(input, init)),
            requestInit: {
                headers: {
                    authorization: "Bearer sk_never_upstream",
                    cookie: "private=1",
                },
            },
        }),
    );
    return connection;
}

test("private worker exposes five tools using the MCP transport", async () => {
    const c = await client();
    assert.deepEqual((await c.listTools()).tools.map((t) => t.name).sort(), [
        "feed_read",
        "hn_item",
        "hn_search",
        "hn_stories",
        "wayback_snapshots",
    ]);
    await c.close();
    assert.equal(
        (await worker.fetch(new Request("https://news.invalid/health"))).status,
        404,
    );
    assert.equal(
        (await worker.fetch(new Request("https://news.invalid/nope"))).status,
        404,
    );
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});

test("modern MCP clients work without server-side sessions", async () => {
    const c = await client({ versionNegotiation: { mode: "auto" } });
    assert.equal(c.getProtocolEra(), "modern");
    assert.equal((await c.listTools()).tools.length, 5);
    await c.close();
});

test("HN lists omit deleted items; requests never forward auth/cookies", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(init.headers.Authorization, undefined);
        assert.equal(new Headers(init.headers).has("cookie"), false);
        assert.equal(init.redirect, "manual");
        const url = String(input);
        return Response.json(
            url.endsWith("topstories.json")
                ? [1, 2]
                : url.includes("/1.json")
                  ? { id: 1, title: "Live" }
                  : { id: 2, deleted: true },
        );
    });
    const c = await client();
    const result = await c.callTool({
        name: "hn_stories",
        arguments: { limit: 2 },
    });
    assert.deepEqual(JSON.parse(result.content[0].text), [
        { id: 1, title: "Live" },
    ]);
    await c.close();
});

test("invalid arguments fail before fetch", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () =>
        assert.fail("must not fetch"),
    );
    const c = await client();
    for (const [name, args] of [
        ["hn_stories", { limit: 21 }],
        ["hn_item", { id: -1 }],
        ["hn_search", { query: " " }],
    ]) {
        const result = await c.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetch.mock.callCount(), 0);
    await c.close();
});

test("missing items, rate limits, malformed upstream JSON remain tool errors", async (t) => {
    const c = await client();
    const mock = t.mock.method(globalThis, "fetch", async () =>
        Response.json(null),
    );
    assert.equal(
        (await c.callTool({ name: "hn_item", arguments: { id: 123 } })).isError,
        true,
    );
    mock.mock.mockImplementation(
        async () => new Response("slow down", { status: 429 }),
    );
    let result = await c.callTool({
        name: "hn_search",
        arguments: { query: "energy" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /429/);
    mock.mock.mockImplementation(
        async () => new Response("Your query was too short."),
    );
    result = await c.callTool({
        name: "hn_search",
        arguments: { query: "xx" },
    });
    assert.match(result.content[0].text, /too short/);
    assert.doesNotMatch(result.content[0].text, /rate limit/);
    await c.close();
});

test("search preserves upstream fields and correctly encodes query", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.searchParams.get("query"), "a&b");
        assert.match(url.pathname, /search_by_date/);
        return Response.json({ hits: [{ objectID: "1", title: "test" }] });
    });
    const c = await client();
    const result = await c.callTool({
        name: "hn_search",
        arguments: { query: "a&b", sort: "date" },
    });
    assert.deepEqual(JSON.parse(result.content[0].text), [
        { objectID: "1", title: "test" },
    ]);
    await c.close();
});

test("feed XML handles RSS attributes, CDATA, Atom single quotes and alternate links", () => {
    const rss = parseFeed(
        '<rss version="2.0"><channel><title>News &amp; More</title><link>https://example.com</link><item id="one"><title><![CDATA[A < B]]></title><link>/story</link><description><![CDATA[<p>text</p>]]></description></item></channel></rss>',
        "https://example.com/feed",
        10,
    );
    assert.equal(rss.title, "News & More");
    assert.equal(rss.entries[0].title, "A < B");
    assert.equal(rss.entries[0].link, "https://example.com/story");
    assert.equal(rss.entries[0].summary, "<p>text</p>");
    const atom = parseFeed(
        "<feed xmlns='http://www.w3.org/2005/Atom'><title>Atom</title><link rel='self' href='/feed'/><link rel='alternate' href='/'/><entry><title>First</title><link href='/first'/><summary>hi</summary></entry></feed>",
        "https://example.com/feed",
        1,
    );
    assert.equal(atom.link, "https://example.com/");
    assert.equal(atom.entries[0].link, "https://example.com/first");
    const namespaced = parseFeed(
        '<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>RSS</title><item><dc:date>2026-10-24</dc:date><content:encoded><![CDATA[Full summary]]></content:encoded></item></channel></rss>',
        "https://example.com",
        10,
    );
    assert.equal(namespaced.entries[0].published, "2026-10-24");
    assert.equal(namespaced.entries[0].summary, "Full summary");
    assert.deepEqual(
        parseFeed(
            "<rss><channel><title>Empty</title></channel></rss>",
            "https://example.com",
            10,
        ).entries,
        [],
    );
});

test("feed parser rejects DTD, entities, malformed XML, and non-feeds", () => {
    for (const xml of [
        '<!DOCTYPE rss [<!ENTITY x "abc">]><rss/>',
        "<rss><channel></rss>",
        "<html>not a feed</html>",
    ]) {
        assert.throws(() => parseFeed(xml, "https://example.com", 10));
    }
});

test("caller URL policy rejects credentials, localhost, IPs, and unsafe redirect hops", async (t) => {
    const mock = t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(null, {
                status: 302,
                headers: { location: "http://127.0.0.1/" },
            }),
    );
    for (const url of [
        "http://localhost/",
        "http://localhost./",
        "http://127.1/",
        "http://[::1]/",
        "https://user:pass@example.com/",
        "file:///etc/passwd",
    ]) {
        await assert.rejects(getText(url), /public HTTP/);
    }
    assert.equal(mock.mock.callCount(), 0);
    await assert.rejects(getText("https://example.com"), /public HTTP/);
    assert.equal(mock.mock.callCount(), 1);
});

test("redirects are bounded and relative locations resolve against current hop", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        seen.push(String(url));
        return new Response(null, {
            status: 302,
            headers: { location: "/next" },
        });
    });
    await assert.rejects(getText("https://example.com/start"), /three times/);
    assert.equal(seen.length, 4);
    assert.equal(seen[1], "https://example.com/next");
});

test("stream size is bounded even without Content-Length", async (t) => {
    let cancelled = false;
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(
                new ReadableStream({
                    pull(controller) {
                        controller.enqueue(new Uint8Array(300 * 1024));
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
            ),
    );
    await assert.rejects(getText("https://example.com"), /512 KiB/);
    assert.equal(cancelled, true);
});

test("Wayback returns exact capture links and passes bounded CDX parameters", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.hostname, "web.archive.org");
        assert.equal(
            url.searchParams.get("url"),
            "https://example.com/?a=1&b=2",
        );
        assert.equal(url.searchParams.get("matchType"), "exact");
        assert.equal(url.searchParams.get("limit"), "-10");
        assert.equal(url.searchParams.get("fastLatest"), "true");
        return Response.json([
            ["timestamp", "original", "statuscode", "mimetype"],
            ["20240101000000", "https://example.com/", "200", "text/html"],
        ]);
    });
    const c = await client();
    const result = await c.callTool({
        name: "wayback_snapshots",
        arguments: { url: "https://example.com/?a=1&b=2" },
    });
    assert.equal(
        JSON.parse(result.content[0].text)[0].snapshot,
        "https://web.archive.org/web/20240101000000/https://example.com/",
    );
    await c.close();
});
