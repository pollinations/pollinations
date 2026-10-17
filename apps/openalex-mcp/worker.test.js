import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "openalex_search_authors",
    "openalex_search_works",
    "openalex_work",
];
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
        { name: "openalex-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://openalex-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers OpenAlex requests from `routes` and records what was asked. */
function mockOpenAlex(routes) {
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

const authorship = (name) => ({
    author_position: "middle",
    author: { id: `https://openalex.org/A${name}`, display_name: name },
});

const WORK = {
    id: "https://openalex.org/W2741809807",
    title: "The state of OA",
    authorships: ["A", "B", "C", "D", "E", "F", "G"].map(authorship),
    publication_year: 2018,
    primary_location: { source: { display_name: "PeerJ" } },
    doi: "https://doi.org/10.7717/peerj.4375",
    cited_by_count: 1234,
    open_access: { is_oa: true, oa_url: "https://doi.org/10.7717/peerj.4375" },
};

const WORK_SUMMARY = {
    id: "W2741809807",
    title: "The state of OA",
    authors: ["A", "B", "C", "D", "E"],
    year: 2018,
    venue: "PeerJ",
    doi: "10.7717/peerj.4375",
    cited_by_count: 1234,
    open_access_url: "https://doi.org/10.7717/peerj.4375",
};

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://openalex-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://openalex-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="openalex-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://openalex-mcp.pollinations.ai/mcp"),
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
        new Request("https://openalex-mcp.pollinations.ai", {
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

test("searches works, keeps 5 authors and filters by year", async () => {
    const requests = mockOpenAlex(() => ({
        results: [WORK, { ...WORK, id: "https://openalex.org/W9", doi: null }],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_search_works",
        arguments: {
            query: "open access",
            from_year: 2015,
            to_year: 2020,
            sort: "cited_by_count",
            limit: 2,
        },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), [
        WORK_SUMMARY,
        { ...WORK_SUMMARY, id: "W9", doi: null },
    ]);
    assert.equal(requests.length, 1);
    const { url } = requests[0];
    assert.equal(url.host, "api.openalex.org");
    assert.equal(url.pathname, "/works");
    assert.equal(url.searchParams.get("search"), "open access");
    assert.equal(url.searchParams.get("per-page"), "2");
    assert.equal(url.searchParams.get("sort"), "cited_by_count:desc");
    assert.equal(
        url.searchParams.get("filter"),
        "from_publication_date:2015-01-01,to_publication_date:2020-12-31",
    );
    assert.match(url.searchParams.get("select"), /authorships/);
    assert.match(requests[0].headers.get("user-agent"), /^openalex-mcp\//);
});

test("default search is by relevance with no filter or sort", async () => {
    const requests = mockOpenAlex(() => ({ results: [] }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_search_works",
        arguments: { query: "graphene" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), []);
    const { searchParams } = requests[0].url;
    assert.equal(searchParams.get("per-page"), "10");
    assert.equal(searchParams.get("sort"), null);
    assert.equal(searchParams.get("filter"), null);
});

test("reads a work by OpenAlex id with the abstract in word order", async () => {
    const requests = mockOpenAlex(() => ({
        ...WORK,
        // Keys deliberately not in reading order; "the" appears twice.
        abstract_inverted_index: {
            cat: [1],
            mat: [5],
            sat: [2],
            the: [0, 4],
            on: [3],
        },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_work",
        arguments: { id: "W2741809807" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), {
        ...WORK_SUMMARY,
        abstract: "the cat sat on the mat",
        abstract_truncated: false,
    });
    assert.equal(requests[0].url.pathname, "/works/W2741809807");
    assert.match(
        requests[0].url.searchParams.get("select"),
        /abstract_inverted_index/,
    );
});

test("reads a work by DOI, with no abstract when OpenAlex has none", async () => {
    const requests = mockOpenAlex(() => ({
        ...WORK,
        doi: "https://doi.org/10.1000/xyz(1)",
        abstract_inverted_index: null,
        open_access: { is_oa: false, oa_url: null },
        primary_location: null,
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_work",
        arguments: { id: "10.1000/xyz(1)" },
    });
    await client.close();

    const work = JSON.parse(textOf(result));
    assert.equal(work.abstract, null);
    assert.equal(work.abstract_truncated, false);
    assert.equal(work.open_access_url, null);
    assert.equal(work.venue, null);
    // The slash in the DOI is percent-encoded, so it cannot add path segments.
    assert.equal(requests[0].url.pathname, "/works/doi:10.1000%2Fxyz(1)");
});

test("cuts a long abstract and says so", async () => {
    mockOpenAlex(() => ({
        ...WORK,
        abstract_inverted_index: {
            word: Array.from({ length: 1000 }, (_, i) => i),
        },
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_work",
        arguments: { id: "W1" },
    });
    await client.close();

    const work = JSON.parse(textOf(result));
    assert.equal(work.abstract.length, 3000);
    assert.equal(work.abstract_truncated, true);
});

test("reports a missing work as a tool error", async () => {
    mockOpenAlex(() => null);
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_work",
        arguments: { id: "W1" },
    });
    await client.close();
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'No OpenAlex work with id "W1".');
});

test("rejects ids that could change the upstream path before any request", async () => {
    const requests = mockOpenAlex(() => WORK);
    const client = await connectClient();
    for (const bad of [
        "",
        "w123",
        "W",
        "W12/../authors",
        "W123?select=id",
        "W123#x",
        "W123 ",
        "https://openalex.org/W123",
        "authors/A1",
        "../W123",
        "10.1000/../../authors",
        "10.1000/a..b",
        "10.1000/a?x=1",
        "10.1000/a#frag",
        "10.1000/a%2F..",
        "10.1000/a b",
        "doi:10.1000/a",
        "https://doi.org/10.1000/a",
    ]) {
        const result = await client
            .callTool({ name: "openalex_work", arguments: { id: bad } })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, JSON.stringify(bad));
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("searches authors", async () => {
    const requests = mockOpenAlex(() => ({
        results: [
            {
                id: "https://openalex.org/A5108093963",
                display_name: "Geoffrey E. Hinton",
                last_known_institutions: [
                    { display_name: "Microsoft (United States)" },
                    { display_name: "University of Toronto" },
                ],
                works_count: 562,
                cited_by_count: 501618,
                summary_stats: { h_index: 145, i10_index: 324 },
            },
            {
                id: "https://openalex.org/A2",
                display_name: "No Institution",
                last_known_institutions: null,
                works_count: 1,
                cited_by_count: 0,
                summary_stats: null,
            },
        ],
    }));
    const client = await connectClient();
    const result = await client.callTool({
        name: "openalex_search_authors",
        arguments: { name: "Hinton", limit: 2 },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), [
        {
            id: "A5108093963",
            name: "Geoffrey E. Hinton",
            institutions: [
                "Microsoft (United States)",
                "University of Toronto",
            ],
            works_count: 562,
            cited_by_count: 501618,
            h_index: 145,
        },
        {
            id: "A2",
            name: "No Institution",
            institutions: [],
            works_count: 1,
            cited_by_count: 0,
            h_index: null,
        },
    ]);
    const { url } = requests[0];
    assert.equal(url.pathname, "/authors");
    assert.equal(url.searchParams.get("search"), "Hinton");
    assert.equal(url.searchParams.get("per-page"), "2");
});

test("turns an OpenAlex outage into a tool error on every tool", async () => {
    mockOpenAlex(() => 503);
    const client = await connectClient();
    for (const [name, args] of [
        ["openalex_search_works", { query: "anything" }],
        ["openalex_work", { id: "W1" }],
        ["openalex_search_authors", { name: "anyone" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, name);
        assert.match(textOf(result), /503/, name);
    }
    await client.close();
});

test("never sends the caller's key upstream", async () => {
    const requests = mockOpenAlex((url) =>
        url.pathname === "/works" || url.pathname === "/authors"
            ? { results: [] }
            : WORK,
    );
    const client = await connectClient();
    await client.callTool({
        name: "openalex_search_works",
        arguments: { query: "a" },
    });
    await client.callTool({ name: "openalex_work", arguments: { id: "W1" } });
    await client.callTool({
        name: "openalex_search_authors",
        arguments: { name: "a" },
    });
    await client.close();

    assert.equal(requests.length, 3);
    for (const { url, headers } of requests) {
        assert.equal(headers.get("authorization"), null);
        assert.ok(![...headers.values()].some((v) => v.includes(TOKEN)));
        assert.ok(!url.href.includes(TOKEN));
        assert.equal(url.searchParams.get("api_key"), null);
        assert.equal(url.searchParams.get("mailto"), null);
    }
});
