import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["hn_front_page", "hn_item", "hn_search"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "hn-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://hn-mcp.pollinations.ai"),
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
        new Request("https://hn-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://hn-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="hn-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://hn-mcp.pollinations.ai/mcp"),
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
        new Request("https://hn-mcp.pollinations.ai", {
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

const SEARCH_HITS = {
    nbHits: 2,
    hits: [
        {
            objectID: "111",
            title: "Show HN: A thing",
            url: "https://example.com/thing",
            author: "pg",
            points: 42,
            num_comments: 7,
            created_at: "2026-10-01T10:00:00.000Z",
        },
        {
            objectID: "222",
            title: null,
            story_title: "A parent story",
            author: "dang",
            comment_text: "<p>Great &amp; useful</p>",
            created_at: "2026-10-02T10:00:00.000Z",
        },
    ],
};

test("hn_search queries Algolia and maps hits", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = new URL(String(input));
        return Response.json(SEARCH_HITS);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "hn_search",
        arguments: { query: "show hn", sort: "date", limit: 5 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(
        requested.origin + requested.pathname,
        "https://hn.algolia.com/api/v1/search_by_date",
    );
    assert.equal(requested.searchParams.get("query"), "show hn");
    assert.equal(requested.searchParams.get("tags"), "story");
    assert.equal(requested.searchParams.get("hitsPerPage"), "5");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.total_hits, 2);
    assert.deepEqual(payload.hits[0], {
        id: 111,
        title: "Show HN: A thing",
        author: "pg",
        created_at: "2026-10-01T10:00:00.000Z",
        hn: "https://news.ycombinator.com/item?id=111",
        url: "https://example.com/thing",
        points: 42,
        comments: 7,
    });
    assert.equal(payload.hits[1].title, "A parent story");
    assert.equal(payload.hits[1].text, "Great & useful");
});

test("hn_front_page reads the front_page tag", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = new URL(String(input));
        return Response.json(SEARCH_HITS);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "hn_front_page",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.equal(requested.pathname, "/api/v1/search");
    assert.equal(requested.searchParams.get("tags"), "front_page");
    assert.equal(requested.searchParams.get("hitsPerPage"), "10");
    assert.equal(JSON.parse(result.content[0].text).length, 2);
});

const ITEM = {
    id: 333,
    type: "story",
    title: "A story",
    author: "pg",
    points: 100,
    url: "https://example.com/story",
    created_at: "2026-10-03T10:00:00.000Z",
    children: [
        {
            id: 334,
            author: "sama",
            text: "<p>First<p>Second &gt; point",
            created_at: "2026-10-03T11:00:00.000Z",
            children: [{ id: 335 }],
        },
        {
            id: 336,
            author: "dang",
            text: "plain",
            created_at: "2026-10-03T12:00:00.000Z",
            children: [],
        },
    ],
};

test("hn_item returns the item with flattened top-level comments", async (t) => {
    let requested;
    t.mock.method(globalThis, "fetch", async (input) => {
        requested = String(input);
        return Response.json(ITEM);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "hn_item",
        arguments: { id: 333, comment_limit: 1 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(requested, "https://hn.algolia.com/api/v1/items/333");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.title, "A story");
    assert.equal(payload.url, "https://example.com/story");
    assert.equal(payload.comments.length, 1);
    assert.deepEqual(payload.comments[0], {
        id: 334,
        author: "sama",
        created_at: "2026-10-03T11:00:00.000Z",
        text: "First\n\nSecond > point",
        replies: 1,
        hn: "https://news.ycombinator.com/item?id=334",
    });
});

test("maps upstream failures to tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        return new Response("upstream down", { status: 502 });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "hn_search",
        arguments: { query: "anything" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /502/);
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const args of [
        { query: "" },
        { query: "x", limit: 0 },
        { query: "x", limit: 31 },
        { query: "x", sort: "hot" },
    ]) {
        const result = await client.callTool({
            name: "hn_search",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    for (const args of [{ id: -1 }, { id: 1, comment_limit: 21 }]) {
        const result = await client.callTool({
            name: "hn_item",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
