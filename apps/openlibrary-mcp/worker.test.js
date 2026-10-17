import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "openlibrary_author",
    "openlibrary_search",
    "openlibrary_work",
];
const SEARCH_FIELDS =
    "key,title,author_name,author_key,first_publish_year,edition_count,cover_i";
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
        { name: "openlibrary-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://openlibrary-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers Open Library requests from `routes` and records what was asked. */
function mockOpenLibrary(routes) {
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
        new Request("https://openlibrary-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://openlibrary-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="openlibrary-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://openlibrary-mcp.pollinations.ai/mcp"),
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
        new Request("https://openlibrary-mcp.pollinations.ai", {
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

test("searches books, maps each result and asks only for the fields it uses", async () => {
    const requests = mockOpenLibrary(() => ({
        docs: [
            {
                key: "/works/OL59800W",
                title: "The Left Hand of Darkness",
                author_name: ["Ursula K. Le Guin"],
                author_key: ["OL31353A"],
                first_publish_year: 1969,
                edition_count: 92,
                cover_i: 10618463,
            },
            { key: "/works/OL893414W", title: "Untitled" },
        ],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openlibrary_search",
        arguments: { query: "left hand of darkness", limit: 2 },
    });
    const defaulted = await client.callTool({
        name: "openlibrary_search",
        arguments: { query: "dune" },
    });
    await client.close();

    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(textOf(result)), [
        {
            title: "The Left Hand of Darkness",
            authors: [{ name: "Ursula K. Le Guin", id: "OL31353A" }],
            firstPublishYear: 1969,
            editionCount: 92,
            workId: "OL59800W",
            coverUrl: "https://covers.openlibrary.org/b/id/10618463-M.jpg",
        },
        {
            title: "Untitled",
            authors: [],
            firstPublishYear: null,
            editionCount: null,
            workId: "OL893414W",
            coverUrl: null,
        },
    ]);
    assert.equal(defaulted.isError, undefined);

    const [search, defaultSearch] = requests;
    assert.equal(search.url.host, "openlibrary.org");
    assert.equal(search.url.pathname, "/search.json");
    assert.equal(search.url.searchParams.get("q"), "left hand of darkness");
    assert.equal(search.url.searchParams.get("limit"), "2");
    assert.equal(search.url.searchParams.get("fields"), SEARCH_FIELDS);
    assert.equal(defaultSearch.url.searchParams.get("limit"), "10");
});

test("reads a work with a string description and keeps the first 10 subjects", async () => {
    const subjects = Array.from(
        { length: 12 },
        (_, index) => `subject ${index + 1}`,
    );
    const requests = mockOpenLibrary(() => ({
        key: "/works/OL27482W",
        title: "The Hobbit",
        description: "A fantasy novel by J. R. R. Tolkien.",
        subjects,
        first_publish_date: "January 1938",
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openlibrary_work",
        arguments: { id: "OL27482W" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), {
        title: "The Hobbit",
        description: "A fantasy novel by J. R. R. Tolkien.",
        subjects: subjects.slice(0, 10),
        firstPublishDate: "January 1938",
    });
    assert.equal(requests[0].url.pathname, "/works/OL27482W.json");
});

test("reads a work whose description is an object, and reports a missing date as null", async () => {
    mockOpenLibrary(() => ({
        key: "/works/OL893414W",
        title: "Dune",
        description: { type: "/type/text", value: "A novel by Frank Herbert." },
        subjects: ["Science fiction"],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openlibrary_work",
        arguments: { id: "OL893414W" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), {
        title: "Dune",
        description: "A novel by Frank Herbert.",
        subjects: ["Science fiction"],
        firstPublishDate: null,
    });
});

test("reads an author whose bio is a string or an object", async () => {
    const requests = mockOpenLibrary((url) => {
        if (url.pathname === "/authors/OL31353A.json") {
            return {
                name: "Ursula K. Le Guin",
                birth_date: "21 October 1929",
                death_date: "22 January 2018",
                bio: "American author of speculative fiction.",
            };
        }
        if (url.pathname === "/authors/OL1A.json") {
            return {
                name: "Sachi Routray",
                birth_date: "1916",
                death_date: "2004",
                bio: { type: "/type/text", value: "Indian poet and novelist." },
            };
        }
        return null;
    });
    const client = await connectClient();
    const plain = await client.callTool({
        name: "openlibrary_author",
        arguments: { id: "OL31353A" },
    });
    const object = await client.callTool({
        name: "openlibrary_author",
        arguments: { id: "OL1A" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(plain)), {
        name: "Ursula K. Le Guin",
        birthDate: "21 October 1929",
        deathDate: "22 January 2018",
        bio: "American author of speculative fiction.",
    });
    assert.deepEqual(JSON.parse(textOf(object)), {
        name: "Sachi Routray",
        birthDate: "1916",
        deathDate: "2004",
        bio: "Indian poet and novelist.",
    });
    assert.equal(requests[1].url.pathname, "/authors/OL1A.json");
});

test("reports a missing work or author as a tool error", async () => {
    mockOpenLibrary(() => null);
    const client = await connectClient();
    const work = await client.callTool({
        name: "openlibrary_work",
        arguments: { id: "OL1W" },
    });
    const author = await client.callTool({
        name: "openlibrary_author",
        arguments: { id: "OL1A" },
    });
    await client.close();

    assert.equal(work.isError, true);
    assert.equal(textOf(work), "No Open Library work OL1W.");
    assert.equal(author.isError, true);
    assert.equal(textOf(author), "No Open Library author OL1A.");
});

test("turns an Open Library outage into a tool error", async () => {
    mockOpenLibrary(() => 503);
    const client = await connectClient();
    const result = await client.callTool({
        name: "openlibrary_search",
        arguments: { query: "anything" },
    });
    await client.close();

    assert.equal(result.isError, true);
    assert.match(textOf(result), /503/);
});

test("rejects IDs that could change the upstream path before any upstream call", async () => {
    const requests = mockOpenLibrary(() => ({}));
    const client = await connectClient();
    const attempts = [
        ["openlibrary_work", "OL1W/../authors/OL1A"],
        ["openlibrary_work", "OL1W?fields=x"],
        ["openlibrary_work", "OL1W#x"],
        ["openlibrary_work", "OL1W%2F"],
        ["openlibrary_work", "OL1W\n"],
        ["openlibrary_work", "ol1w"],
        ["openlibrary_work", "OL12345678901W"],
        ["openlibrary_work", "OL1A"],
        ["openlibrary_author", "OL1W"],
        ["openlibrary_author", "/authors/OL1A"],
        ["openlibrary_author", "OL1A.json"],
    ];
    for (const [name, id] of attempts) {
        const result = await client.callTool({ name, arguments: { id } });
        assert.equal(result.isError, true, `${name} ${JSON.stringify(id)}`);
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("turns a missing ID into a tool error before any upstream call", async () => {
    const requests = mockOpenLibrary(() => ({}));
    const client = await connectClient();
    for (const name of ["openlibrary_work", "openlibrary_author"]) {
        const result = await client.callTool({ name, arguments: {} });
        assert.equal(result.isError, true, name);
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("never sends the caller's key to Open Library, from any tool", async () => {
    const requests = mockOpenLibrary((url) => {
        if (url.pathname === "/search.json") return { docs: [] };
        if (url.pathname === "/works/OL59800W.json") {
            return { title: "The Left Hand of Darkness" };
        }
        return { name: "Ursula K. Le Guin" };
    });
    const client = await connectClient();
    await client.callTool({
        name: "openlibrary_search",
        arguments: { query: "dune" },
    });
    await client.callTool({
        name: "openlibrary_work",
        arguments: { id: "OL59800W" },
    });
    await client.callTool({
        name: "openlibrary_author",
        arguments: { id: "OL31353A" },
    });
    await client.close();

    assert.equal(requests.length, 3);
    for (const { url, headers } of requests) {
        assert.equal(headers.get("authorization"), null, url.href);
        assert.equal(url.href.includes(TOKEN), false, url.href);
        assert.match(headers.get("user-agent"), /^openlibrary-mcp\//);
    }
});
