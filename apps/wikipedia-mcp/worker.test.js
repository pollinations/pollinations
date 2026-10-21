import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["wikipedia_page", "wikipedia_search"];
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
        { name: "wikipedia-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://wikipedia-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers Wikipedia requests from `routes` and records what was asked. */
function mockWikipedia(routes) {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({ url, headers: new Headers(init?.headers) });
        const answer = routes(url);
        return answer === null
            ? new Response("not found", { status: 404 })
            : typeof answer === "number"
              ? new Response("error", { status: answer })
              : Response.json(answer);
    };
    return requests;
}

const textOf = (result) => result.content[0].text;

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://wikipedia-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://wikipedia-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="wikipedia-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://wikipedia-mcp.pollinations.ai/mcp"),
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
        new Request("https://wikipedia-mcp.pollinations.ai", {
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

test("searches a language edition and cleans the snippets", async () => {
    const requests = mockWikipedia(() => ({
        pages: [
            {
                key: "Ada_Lovelace",
                title: "Ada Lovelace",
                description: "English mathematician",
                excerpt:
                    'wrote the <span class="searchmatch">first</span> &quot;program&quot; &amp; notes',
            },
        ],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "wikipedia_search",
        arguments: { query: "Ada Lovelace", limit: 3, language: "de" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), [
        {
            title: "Ada Lovelace",
            description: "English mathematician",
            snippet: 'wrote the first "program" & notes',
            url: "https://de.wikipedia.org/wiki/Ada_Lovelace",
        },
    ]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.host, "de.wikipedia.org");
    assert.equal(requests[0].url.searchParams.get("q"), "Ada Lovelace");
    assert.equal(requests[0].url.searchParams.get("limit"), "3");
    // Wikimedia asks API clients to identify themselves; the caller's key stays home.
    assert.match(requests[0].headers.get("user-agent"), /^wikipedia-mcp\//);
    assert.equal(requests[0].headers.get("authorization"), null);
});

test("reads a page summary and reports a missing page as a tool error", async () => {
    const requests = mockWikipedia((url) =>
        url.pathname.endsWith("/Ada%20Lovelace")
            ? {
                  title: "Ada Lovelace",
                  description: "English mathematician",
                  extract: "Augusta Ada King was an English mathematician.",
                  content_urls: {
                      desktop: {
                          page: "https://en.wikipedia.org/wiki/Ada_Lovelace",
                      },
                  },
              }
            : null,
    );
    const client = await connectClient();
    const found = await client.callTool({
        name: "wikipedia_page",
        arguments: { title: "Ada Lovelace" },
    });
    assert.equal(found.isError, undefined);
    assert.deepEqual(JSON.parse(textOf(found)), {
        title: "Ada Lovelace",
        description: "English mathematician",
        summary: "Augusta Ada King was an English mathematician.",
        url: "https://en.wikipedia.org/wiki/Ada_Lovelace",
    });
    assert.equal(requests[0].url.host, "en.wikipedia.org");

    const missing = await client.callTool({
        name: "wikipedia_page",
        arguments: { title: "No such page" },
    });
    await client.close();
    assert.equal(missing.isError, true);
    assert.equal(textOf(missing), 'No Wikipedia page titled "No such page".');
});

test("reads the full article, cut at 20000 characters", async () => {
    const requests = mockWikipedia(() => ({
        query: {
            pages: {
                42: { title: "Long", extract: "x".repeat(25_000) },
            },
        },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "wikipedia_page",
        arguments: { title: "Long", full: true },
    });
    await client.close();

    const article = JSON.parse(textOf(result));
    assert.equal(article.text.length, 20_000);
    assert.equal(article.truncated, true);
    assert.equal(requests[0].url.searchParams.get("explaintext"), "1");
    assert.equal(requests[0].url.searchParams.get("titles"), "Long");
});

test("reports a missing full article as a tool error", async () => {
    mockWikipedia(() => ({
        query: { pages: { "-1": { title: "Nope", missing: "" } } },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "wikipedia_page",
        arguments: { title: "Nope", full: true },
    });
    await client.close();
    assert.equal(result.isError, true);
});

test("never builds a host from the language argument", async () => {
    const requests = mockWikipedia(() => ({ pages: [] }));
    const client = await connectClient();
    for (const bad of ["evil.com/x", "en.evil.com", "EN", "e", "en/../x"]) {
        const result = await client
            .callTool({
                name: "wikipedia_search",
                arguments: { query: "a", language: bad },
            })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, bad);
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("turns a Wikipedia outage into a tool error", async () => {
    mockWikipedia(() => 503);
    const client = await connectClient();
    const result = await client.callTool({
        name: "wikipedia_search",
        arguments: { query: "anything" },
    });
    await client.close();
    assert.equal(result.isError, true);
    assert.match(textOf(result), /503/);
});
