import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://news-mcp.pollinations.ai";
const TOKEN = "sk_test";

const ARTICLES = JSON.stringify({
    articles: [
        {
            url: "https://www.reuters.com/world/solar-farm-opens",
            url_mobile: "https://mobile.reuters.com/world/solar-farm-opens",
            title: "Largest solar farm opens in Rajasthan",
            seendate: "20261017T080000Z",
            socialimage: "https://www.reuters.com/img.jpg",
            domain: "reuters.com",
            language: "English",
            sourcecountry: "India",
        },
        {
            url: "https://example.net/news/battery",
            title: "Battery costs fall again",
            seendate: "20261017T070000Z",
            domain: "example.net",
            language: "English",
            sourcecountry: "United States",
        },
    ],
});

async function connectClient(options = {}) {
    const client = new Client(
        { name: "news-mcp-worker-test", version: "0.0.1" },
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
            'Bearer realm="news-mcp.pollinations.ai"',
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

test("exposes a read-only news_search tool over modern and legacy stateless HTTP", async () => {
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
                ["news_search"],
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("searches news without forwarding caller credentials", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://api.gdeltproject.org");
        assert.equal(url.pathname, "/api/v2/doc/doc");
        assert.deepEqual(
            [...url.searchParams.keys()],
            ["query", "mode", "maxrecords", "format", "sort", "timespan"],
        );
        assert.equal(
            url.searchParams.get("query"),
            '"solar farm" sourcelang:eng',
        );
        assert.equal(url.searchParams.get("mode"), "artlist");
        assert.equal(url.searchParams.get("maxrecords"), "2");
        assert.equal(url.searchParams.get("format"), "json");
        assert.equal(url.searchParams.get("sort"), "datedesc");
        assert.equal(url.searchParams.get("timespan"), "7d");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(ARTICLES);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "news_search",
        arguments: {
            query: '"solar farm" sourcelang:eng',
            timespan: "7d",
            maxrecords: 2,
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        query: '"solar farm" sourcelang:eng',
        articles: [
            {
                url: "https://www.reuters.com/world/solar-farm-opens",
                title: "Largest solar farm opens in Rajasthan",
                seen: "20261017T080000Z",
                domain: "reuters.com",
                language: "English",
                country: "India",
            },
            {
                url: "https://example.net/news/battery",
                title: "Battery costs fall again",
                seen: "20261017T070000Z",
                domain: "example.net",
                language: "English",
                country: "United States",
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("returns an empty result set when GDELT finds nothing", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(JSON.stringify({ articles: [] })),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "news_search",
        arguments: { query: "zzzznonexistent" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        query: "zzzznonexistent",
        articles: [],
    });
});

test("reports rate limiting, HTTP and network failures as tool errors", async (t) => {
    let failure;
    t.mock.method(globalThis, "fetch", async () => {
        if (failure instanceof Error) throw failure;
        return failure;
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [response, message] of [
        [
            new Response("Please limit requests to one every 5 seconds"),
            /rate limiting/,
        ],
        [new Response(null, { status: 429 }), /rate limiting/],
        [new Response(null, { status: 503 }), /HTTP 503/],
        [new Error("Network unavailable"), /Network unavailable/],
        [
            new DOMException("GDELT search timed out", "TimeoutError"),
            /timed out/,
        ],
    ]) {
        failure = response;
        const result = await client.callTool({
            name: "news_search",
            arguments: { query: "solar farm" },
        });
        assert.equal(result.isError, true, message);
        assert.match(result.content[0].text, message);
    }
});

test("rejects invalid arguments before querying GDELT", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected GDELT request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["news_search", {}],
        ["news_search", { query: " " }],
        ["news_search", { query: "a" }],
        ["news_search", { query: "solar".repeat(101) }],
        ["news_search", { query: "solar", timespan: "7days" }],
        ["news_search", { query: "solar", maxrecords: 0 }],
        ["news_search", { query: "solar", maxrecords: 76 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, JSON.stringify([name, args]));
    }
    assert.equal(upstream.mock.callCount(), 0);
});
