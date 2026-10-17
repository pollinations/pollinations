import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://arxiv-mcp.pollinations.ai";
const TOKEN = "sk_test_request_scoped";

const FEED = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>79844</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2312.10793v3</id>
    <title>Demystifying &amp; Understanding &#x2014; Mixing</title>
    <updated>2024-02-18T17:13:36Z</updated>
    <link href="https://arxiv.org/abs/2312.10793v3" rel="alternate" type="text/html"/>
    <link href="https://arxiv.org/pdf/2312.10793v3" rel="related" type="application/pdf" title="pdf"/>
    <summary>Instruction tuning improves models.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <published>2023-12-17T18:44:26Z</published>
    <arxiv:comment>Instruction Tuning</arxiv:comment>
    <arxiv:doi>10.1234/example</arxiv:doi>
    <arxiv:journal_ref>JMLR 1</arxiv:journal_ref>
    <arxiv:primary_category term="cs.CL"/>
    <author>
      <name>Renxi Wang</name>
    </author>
    <author>
      <name>Haonan Li</name>
    </author>
  </entry>
</feed>`;

const SINGLE_AUTHOR_FEED = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>2</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2402.11651v2</id>
    <title>Learning From Failure</title>
    <updated>2024-04-16T11:41:13Z</updated>
    <link href="https://arxiv.org/abs/2402.11651v2" rel="alternate" type="text/html"/>
    <link href="https://arxiv.org/pdf/2402.11651v2" rel="related" type="application/pdf" title="pdf"/>
    <summary>Negative examples help.</summary>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <published>2024-02-17T18:03:14Z</published>
    <arxiv:primary_category term="cs.AI"/>
    <author>
      <name>Ada Lovelace</name>
    </author>
  </entry>
</feed>`;

async function connectClient(options = {}) {
    const client = new Client(
        { name: "arxiv-mcp-worker-test", version: "0.0.1" },
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
            'Bearer realm="arxiv-mcp.pollinations.ai"',
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
                ["arxiv_search", "arxiv_paper"],
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("searches without forwarding caller credentials and returns parsed papers", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://export.arxiv.org");
        assert.equal(url.pathname, "/api/query");
        assert.deepEqual(
            [...url.searchParams.keys()],
            ["search_query", "start", "max_results", "sortBy"],
        );
        assert.equal(
            url.searchParams.get("search_query"),
            "ti:transformer AND cat:cs.CL",
        );
        assert.equal(url.searchParams.get("start"), "0");
        assert.equal(url.searchParams.get("max_results"), "2");
        assert.equal(url.searchParams.get("sortBy"), "submittedDate");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.equal(init.redirect, "manual");
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(FEED);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "arxiv_search",
        arguments: {
            query: "ti:transformer AND cat:cs.CL",
            limit: 2,
            sortBy: "submittedDate",
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        totalResults: 79844,
        papers: [
            {
                id: "http://arxiv.org/abs/2312.10793v3",
                title: "Demystifying & Understanding — Mixing",
                summary: "Instruction tuning improves models.",
                published: "2023-12-17T18:44:26Z",
                updated: "2024-02-18T17:13:36Z",
                authors: ["Renxi Wang", "Haonan Li"],
                categories: ["cs.CL", "cs.AI"],
                primaryCategory: "cs.CL",
                absUrl: "https://arxiv.org/abs/2312.10793v3",
                pdfUrl: "https://arxiv.org/pdf/2312.10793v3",
                comment: "Instruction Tuning",
                doi: "10.1234/example",
                journalRef: "JMLR 1",
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("fetches by arXiv id or URL and keeps single values as arrays", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.deepEqual(
            [...url.searchParams.keys()],
            ["id_list", "max_results"],
        );
        assert.equal(
            url.searchParams.get("id_list"),
            "2312.10793v3,2402.11651",
        );
        assert.equal(url.searchParams.get("max_results"), "2");
        return new Response(SINGLE_AUTHOR_FEED);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "arxiv_paper",
        arguments: {
            id: "https://arxiv.org/abs/2312.10793v3?download=1, 2402.11651",
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        totalResults: 2,
        papers: [
            {
                id: "http://arxiv.org/abs/2402.11651v2",
                title: "Learning From Failure",
                summary: "Negative examples help.",
                published: "2024-02-17T18:03:14Z",
                updated: "2024-04-16T11:41:13Z",
                authors: ["Ada Lovelace"],
                categories: ["cs.AI"],
                primaryCategory: "cs.AI",
                absUrl: "https://arxiv.org/abs/2402.11651v2",
                pdfUrl: "https://arxiv.org/pdf/2402.11651v2",
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("returns an empty result set for a feed without entries", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(`<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "arxiv_search",
        arguments: { query: "zzzznonexistent" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        totalResults: 0,
        papers: [],
    });
});

test("rejects invalid arguments before querying arXiv", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected arXiv request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["arxiv_search", {}],
        ["arxiv_search", { query: " " }],
        ["arxiv_search", { query: "a".repeat(501) }],
        ["arxiv_search", { query: "electron", limit: 0 }],
        ["arxiv_search", { query: "electron", limit: 51 }],
        ["arxiv_search", { query: "electron", limit: 1.5 }],
        ["arxiv_search", { query: "electron", sortBy: "postedDate" }],
        ["arxiv_paper", {}],
        ["arxiv_paper", { id: "" }],
        ["arxiv_paper", { id: " , " }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, JSON.stringify([name, args]));
    }
    assert.equal(upstream.mock.callCount(), 0);
});

test("reports HTTP, network, timeout and non-feed failures as tool errors", async (t) => {
    let failure;
    t.mock.method(globalThis, "fetch", async () => {
        if (failure instanceof Error) throw failure;
        return failure;
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [response, message] of [
        [new Response(null, { status: 503 }), /HTTP 503/],
        [
            new Response(null, {
                status: 302,
                headers: { Location: "https://example.com" },
            }),
            /HTTP 302/,
        ],
        [new Response("<html>Bad Gateway</html>"), /Atom feed/],
        [new Error("Network unavailable"), /Network unavailable/],
        [
            new DOMException("arXiv query timed out", "TimeoutError"),
            /timed out/,
        ],
    ]) {
        failure = response;
        const result = await client.callTool({
            name: "arxiv_search",
            arguments: { query: "electron" },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, message);
    }
});
