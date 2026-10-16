import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["hn_item", "hn_search", "hn_stories"];
const FIREBASE = "https://hacker-news.firebaseio.com/v0";
const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "hackernews-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://hackernews-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers Hacker News requests from `routes` and records what was asked. */
function mockHackerNews(routes) {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({ url, headers: new Headers(init?.headers) });
        const answer = routes(url);
        return typeof answer === "number"
            ? new Response("error", { status: answer })
            : Response.json(answer);
    };
    return requests;
}

const textOf = (result) => result.content[0].text;

const story = (id, extra = {}) => ({
    id,
    type: "story",
    by: "pg",
    score: 57,
    time: 1160418111,
    title: `Story ${id}`,
    url: `https://example.com/${id}`,
    descendants: 3,
    ...extra,
});

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://hackernews-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://hackernews-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="hackernews-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://hackernews-mcp.pollinations.ai/mcp"),
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
        new Request("https://hackernews-mcp.pollinations.ai", {
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

test("lists stories, skipping deleted and dead items", async () => {
    const requests = mockHackerNews((url) => {
        const path = url.pathname;
        if (path === "/v0/askstories.json") return [1, 2, 3, 4, 5];
        if (path === "/v0/item/1.json") return story(1);
        if (path === "/v0/item/2.json") return { id: 2, deleted: true };
        if (path === "/v0/item/3.json") return story(3, { dead: true });
        if (path === "/v0/item/4.json") return null;
        return story(5, { url: undefined, descendants: undefined });
    });
    const client = await connectClient();
    const result = await client.callTool({
        name: "hn_stories",
        arguments: { list: "ask", limit: 5 },
    });
    await client.close();

    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(textOf(result)), [
        {
            id: 1,
            title: "Story 1",
            url: "https://example.com/1",
            score: 57,
            by: "pg",
            time: "2006-10-09T18:21:51.000Z",
            comments: 3,
            discussion: "https://news.ycombinator.com/item?id=1",
        },
        {
            id: 5,
            title: "Story 5",
            url: null,
            score: 57,
            by: "pg",
            time: "2006-10-09T18:21:51.000Z",
            comments: 0,
            discussion: "https://news.ycombinator.com/item?id=5",
        },
    ]);
    assert.equal(requests[0].url.href, `${FIREBASE}/askstories.json`);
});

test("defaults to the top 10 stories", async () => {
    const requests = mockHackerNews((url) =>
        url.pathname === "/v0/topstories.json"
            ? Array.from({ length: 40 }, (_, index) => index + 100)
            : story(Number(url.pathname.match(/(\d+)\.json/)[1])),
    );
    const client = await connectClient();
    const result = await client.callTool({
        name: "hn_stories",
        arguments: {},
    });
    await client.close();

    assert.equal(JSON.parse(textOf(result)).length, 10);
    assert.equal(requests[0].url.pathname, "/v0/topstories.json");
    assert.equal(requests.length, 11);
});

test("rejects an unknown list and out-of-range limits", async () => {
    const requests = mockHackerNews(() => []);
    const client = await connectClient();
    for (const args of [
        { list: "hot" },
        { limit: 0 },
        { limit: 31 },
        { limit: 1.5 },
    ]) {
        const result = await client
            .callTool({ name: "hn_stories", arguments: args })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    for (const args of [
        { query: "a", limit: 21 },
        { query: "a", sort: "points" },
        { query: "a", tags: "poll" },
    ]) {
        const result = await client
            .callTool({ name: "hn_search", arguments: args })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    for (const args of [{ id: 1, comments: 21 }, { id: 0 }]) {
        const result = await client
            .callTool({ name: "hn_item", arguments: args })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, JSON.stringify(args));
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("reads an item with plain-text top-level comments, skipping dead ones", async () => {
    const requests = mockHackerNews((url) => {
        const path = url.pathname;
        if (path === "/v0/item/10.json") {
            return story(10, {
                text: 'Intro<p>See <a href="https:&#x2F;&#x2F;example.com&#x2F;a" rel="nofollow">https:&#x2F;&#x2F;example.com&#x2F;...</a>',
                kids: [11, 12, 13, 14],
            });
        }
        if (path === "/v0/item/11.json") {
            return {
                id: 11,
                type: "comment",
                by: "alice",
                time: 1160418111,
                parent: 10,
                text: "&gt; quoted &amp; <i>emphasised</i> it&#x27;s<p>second <b>paragraph</b><br>line &lt;b&gt;",
            };
        }
        if (path === "/v0/item/12.json") return { id: 12, deleted: true };
        if (path === "/v0/item/13.json") {
            return { id: 13, type: "comment", dead: true, text: "spam" };
        }
        return { id: 14, type: "comment", by: "bob", time: 1160418112 };
    });
    const client = await connectClient();
    const result = await client.callTool({
        name: "hn_item",
        arguments: { id: 10, comments: 3 },
    });
    await client.close();

    const item = JSON.parse(textOf(result));
    assert.equal(item.id, 10);
    assert.equal(item.type, "story");
    assert.equal(item.title, "Story 10");
    assert.equal(item.text, "Intro\n\nSee https://example.com/a");
    assert.equal(item.totalComments, 3);
    assert.equal(item.discussion, "https://news.ycombinator.com/item?id=10");
    assert.deepEqual(item.comments, [
        {
            id: 11,
            by: "alice",
            time: "2006-10-09T18:21:51.000Z",
            text: "> quoted & emphasised it's\n\nsecond paragraph\nline <b>",
        },
    ]);
    // only the first 3 kids were fetched (11, 12, 13), not 14
    assert.deepEqual(requests.map(({ url }) => url.pathname).sort(), [
        "/v0/item/10.json",
        "/v0/item/11.json",
        "/v0/item/12.json",
        "/v0/item/13.json",
    ]);
});

test("reports a missing, deleted or dead item as a tool error", async () => {
    mockHackerNews((url) =>
        url.pathname === "/v0/item/1.json"
            ? null
            : url.pathname === "/v0/item/2.json"
              ? { id: 2, deleted: true }
              : { id: 3, dead: true, type: "story" },
    );
    const client = await connectClient();
    for (const id of [1, 2, 3]) {
        const result = await client.callTool({
            name: "hn_item",
            arguments: { id },
        });
        assert.equal(result.isError, true, String(id));
        assert.equal(textOf(result), `No Hacker News item ${id}.`);
    }
    await client.close();
});

test("searches by relevance or date with tags and cleans comment text", async () => {
    const requests = mockHackerNews(() => ({
        hits: [
            {
                objectID: "22238335",
                _tags: ["story", "author_Sikul", "story_22238335"],
                title: "Why Discord is switching from Go to Rust",
                url: "https://blog.discordapp.com/x",
                author: "Sikul",
                points: 1582,
                num_comments: 642,
                created_at: "2020-02-04T17:30:40Z",
            },
            {
                objectID: "99",
                _tags: ["comment", "author_eslaught", "story_5"],
                story_title: "Some story",
                comment_text: "no GC (e.g. <em>Rust</em>)<p>&quot;quoted&quot;",
                author: "eslaught",
                points: null,
                created_at: "2015-02-04T17:30:40Z",
            },
        ],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "hn_search",
        arguments: { query: "rust", sort: "date", tags: "comment", limit: 2 },
    });
    assert.deepEqual(JSON.parse(textOf(result)), [
        {
            id: 22238335,
            type: "story",
            title: "Why Discord is switching from Go to Rust",
            url: "https://blog.discordapp.com/x",
            text: "",
            score: 1582,
            by: "Sikul",
            time: "2020-02-04T17:30:40Z",
            comments: 642,
            discussion: "https://news.ycombinator.com/item?id=22238335",
        },
        {
            id: 99,
            type: "comment",
            title: "Some story",
            url: null,
            text: 'no GC (e.g. Rust)\n\n"quoted"',
            score: null,
            by: "eslaught",
            time: "2015-02-04T17:30:40Z",
            comments: 0,
            discussion: "https://news.ycombinator.com/item?id=99",
        },
    ]);
    assert.equal(requests[0].url.origin, "https://hn.algolia.com");
    assert.equal(requests[0].url.pathname, "/api/v1/search_by_date");
    assert.equal(requests[0].url.searchParams.get("query"), "rust");
    assert.equal(requests[0].url.searchParams.get("tags"), "comment");
    assert.equal(requests[0].url.searchParams.get("hitsPerPage"), "2");

    await client.callTool({ name: "hn_search", arguments: { query: "rust" } });
    await client.close();
    assert.equal(requests[1].url.pathname, "/api/v1/search");
    assert.equal(requests[1].url.searchParams.get("tags"), null);
    assert.equal(requests[1].url.searchParams.get("hitsPerPage"), "10");
});

test("turns a Hacker News outage into a tool error", async () => {
    mockHackerNews(() => 503);
    const client = await connectClient();
    for (const call of [
        { name: "hn_stories", arguments: {} },
        { name: "hn_item", arguments: { id: 1 } },
        { name: "hn_search", arguments: { query: "x" } },
    ]) {
        const result = await client.callTool(call);
        assert.equal(result.isError, true, call.name);
        assert.match(textOf(result), /503/);
    }
    await client.close();
});

test("never sends the caller's key upstream", async () => {
    const requests = mockHackerNews((url) =>
        url.hostname === "hn.algolia.com"
            ? { hits: [] }
            : url.pathname === "/v0/topstories.json"
              ? [1]
              : story(1, { kids: [2] }),
    );
    const client = await connectClient();
    await client.callTool({ name: "hn_stories", arguments: { limit: 1 } });
    await client.callTool({ name: "hn_item", arguments: { id: 1 } });
    await client.callTool({ name: "hn_search", arguments: { query: "x" } });
    await client.close();

    assert.ok(requests.length >= 4);
    for (const { url, headers } of requests) {
        assert.equal(headers.get("authorization"), null, url.href);
        assert.ok(!url.href.includes(TOKEN), url.href);
        assert.match(headers.get("user-agent"), /^hackernews-mcp\//);
    }
});
