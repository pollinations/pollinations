import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["get_article", "search_articles"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "pubmed-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://pubmed-mcp.pollinations.ai"),
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

const SUMMARY = {
    id: "32554568",
    source: "MED",
    pmid: "32554568",
    doi: "10.1016/S0140-6736(20)30752-2",
    title: "Global burden of disease",
    authorString: "GBD 2019 Risk Factors Collaborators.",
    journalTitle: "Lancet",
    pubYear: "2020",
    citedByCount: 6792,
    isOpenAccess: "Y",
};

function searchResponse() {
    return Response.json({
        hitCount: 42,
        resultList: { result: [SUMMARY] },
    });
}

function coreResponse() {
    return Response.json({
        hitCount: 1,
        resultList: {
            result: [
                {
                    ...SUMMARY,
                    inEPMC: "Y",
                    abstractText:
                        "<h4>Background</h4>Risk factors matter.<h4>Methods</h4>We estimated effects.",
                    journalInfo: {
                        journal: { title: "The Lancet" },
                        volume: "396",
                        issue: "10258",
                        yearOfPublication: "2020",
                    },
                    pageInfo: "1223-1249",
                    pubTypeList: {
                        pubType: ["research-article", "journal article"],
                    },
                    keywordList: { keyword: ["global health", "risk factors"] },
                    meshHeadingList: {
                        meshHeading: [
                            { descriptorName: "Global Health" },
                            { descriptorName: "Risk Factors" },
                        ],
                    },
                },
            ],
        },
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://pubmed-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://pubmed-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="pubmed-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://pubmed-mcp.pollinations.ai/mcp"),
    );
    assert.equal(missing.status, 404);
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
        new Request("https://pubmed-mcp.pollinations.ai", {
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

test("searches articles with filters and without forwarding the key", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen = { url: new URL(String(input)), init };
        return searchResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_articles",
        arguments: {
            query: "semaglutide",
            limit: 5,
            sort: "cited",
            open_access: true,
            min_year: 2020,
        },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://www.ebi.ac.uk");
    assert.equal(seen.url.pathname, "/europepmc/webservices/rest/search");
    assert.match(
        seen.url.searchParams.get("query"),
        /^\(semaglutide\) AND OPEN_ACCESS:y AND PUB_YEAR:\[2020 TO \d{4}\]$/,
    );
    assert.equal(seen.url.searchParams.get("pageSize"), "5");
    assert.equal(seen.url.searchParams.get("sort"), "CITED desc");
    assert.equal(seen.url.searchParams.get("resultType"), "lite");
    assert.equal(
        new Headers(seen.init.headers).get("authorization"),
        null,
        "the caller's key must not reach Europe PMC",
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.hit_count, 42);
    assert.equal(payload.articles[0].pmid, "32554568");
    assert.equal(payload.articles[0].open_access, true);
    assert.equal(
        payload.articles[0].url,
        "https://europepmc.org/article/MED/32554568",
    );
});

test("reads an article by DOI with abstract and metadata", async (t) => {
    let query;
    t.mock.method(globalThis, "fetch", async (input) => {
        query = new URL(String(input)).searchParams.get("query");
        return coreResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_article",
        arguments: { id: "10.1016/S0140-6736(20)30752-2" },
    });

    assert.notEqual(result.isError, true);
    assert.equal(query, 'DOI:"10.1016/S0140-6736(20)30752-2"');
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.pmid, "32554568");
    assert.match(payload.abstract, /Background\n\nRisk factors matter\./);
    assert.doesNotMatch(payload.abstract, /<h4>/);
    assert.equal(payload.journal_details.title, "The Lancet");
    assert.equal(payload.keywords[1], "risk factors");
    assert.deepEqual(payload.mesh_terms, ["Global Health", "Risk Factors"]);
    assert.equal(payload.full_text_available, true);
});

test("looks up numeric ids as PMIDs", async (t) => {
    let query;
    t.mock.method(globalThis, "fetch", async (input) => {
        query = new URL(String(input)).searchParams.get("query");
        return coreResponse();
    });
    const client = await connectClient();
    t.after(() => client.close());

    await client.callTool({
        name: "get_article",
        arguments: { id: "32554568" },
    });

    assert.equal(query, "EXT_ID:32554568");
});

test("reports an article that does not exist", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ hitCount: 0, resultList: { result: [] } }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_article",
        arguments: { id: "PMC0000000" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No article found for PMC0000000/);
});

test("rejects malformed ids before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_article",
        arguments: { id: '10.1/" OR ANYTHING' },
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("maps upstream failures to tool errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("upstream exploded", { status: 502 }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_articles",
        arguments: { query: "anything" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Europe PMC search error \(502\)/);
});
