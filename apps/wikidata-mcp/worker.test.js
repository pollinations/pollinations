import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["get_entity", "search_entities"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "wikidata-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://wikidata-mcp.pollinations.ai"),
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

function entityResponse() {
    return Response.json({
        entities: {
            Q42: {
                id: "Q42",
                type: "item",
                labels: { en: { language: "en", value: "Douglas Adams" } },
                descriptions: {
                    en: {
                        language: "en",
                        value: "English writer and humorist",
                    },
                },
                aliases: {
                    en: [{ language: "en", value: "Douglas Noël Adams" }],
                },
                sitelinks: {
                    enwiki: {
                        title: "Douglas Adams",
                        url: "https://en.wikipedia.org/wiki/Douglas_Adams",
                    },
                },
                claims: {
                    P31: [
                        {
                            mainsnak: {
                                datatype: "wikibase-item",
                                datavalue: { value: { id: "Q5" } },
                            },
                            rank: "normal",
                        },
                    ],
                    P569: [
                        {
                            mainsnak: {
                                datatype: "time",
                                datavalue: {
                                    value: {
                                        time: "+1952-03-11T00:00:00Z",
                                        precision: 11,
                                        calendar: "gregorian",
                                    },
                                },
                            },
                            rank: "normal",
                        },
                    ],
                    P2048: [
                        {
                            mainsnak: {
                                datatype: "quantity",
                                datavalue: {
                                    value: { amount: "+1.96", unit: "Q11573" },
                                },
                            },
                            rank: "normal",
                        },
                    ],
                    P1477: [
                        {
                            mainsnak: {
                                datatype: "monolingualtext",
                                datavalue: {
                                    value: {
                                        text: "Douglas Noël Adams",
                                        language: "en",
                                    },
                                },
                            },
                            rank: "normal",
                        },
                    ],
                    P646: [
                        {
                            mainsnak: {
                                datatype: "external-id",
                                datavalue: { value: "/m/0282x" },
                            },
                            rank: "normal",
                        },
                    ],
                },
            },
        },
    });
}

function labelsResponse(ids) {
    const entities = {};
    for (const id of ids) {
        entities[id] = {
            id,
            labels: {
                en: { language: "en", value: id === "Q5" ? "human" : id },
            },
        };
    }
    return Response.json({ entities });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://wikidata-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://wikidata-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="wikidata-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://wikidata-mcp.pollinations.ai/mcp"),
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
        new Request("https://wikidata-mcp.pollinations.ai", {
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

test("searches entities without forwarding the Pollinations key", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen = { url: new URL(String(input)), init };
        return Response.json({
            search: [
                {
                    id: "Q42",
                    label: "Douglas Adams",
                    description: "English writer and humorist",
                    aliases: ["Douglas Noël Adams"],
                    concepturi: "http://www.wikidata.org/entity/Q42",
                },
            ],
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_entities",
        arguments: { query: "Douglas Adams", language: "de", limit: 3 },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://www.wikidata.org");
    assert.equal(seen.url.searchParams.get("action"), "wbsearchentities");
    assert.equal(seen.url.searchParams.get("search"), "Douglas Adams");
    assert.equal(seen.url.searchParams.get("language"), "de");
    assert.equal(seen.url.searchParams.get("limit"), "3");
    assert.equal(
        new Headers(seen.init.headers).get("authorization"),
        null,
        "the caller's key must not reach Wikidata",
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.results[0].id, "Q42");
    assert.equal(payload.results[0].label, "Douglas Adams");
});

test("reads claims, simplifies values, and resolves referenced labels", async (t) => {
    let labelRequest;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(String(input));
        if (url.searchParams.get("action") === "wbgetentities") {
            labelRequest = { url, init };
            return labelsResponse(url.searchParams.get("ids").split("|"));
        }
        return entityResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_entity",
        arguments: { id: "q42" },
    });

    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.id, "Q42");
    assert.equal(payload.label, "Douglas Adams");
    assert.equal(payload.aliases[0], "Douglas Noël Adams");
    assert.equal(payload.wikipedia.title, "Douglas Adams");
    assert.equal(payload.claims.P31[0].value.id, "Q5");
    assert.equal(payload.claims.P569[0].value.time, "+1952-03-11T00:00:00Z");
    assert.equal(payload.claims.P2048[0].value.amount, "+1.96");
    assert.equal(payload.claims.P646[0].value, "/m/0282x");
    assert.deepEqual(payload.referenced_labels, { Q5: "human" });
    assert.equal(labelRequest.url.searchParams.get("props"), "labels");
    assert.equal(
        new Headers(labelRequest.init.headers).get("authorization"),
        null,
    );
});

test("restricts claims to requested properties", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.searchParams.get("action") === "wbgetentities") {
            return labelsResponse([]);
        }
        return entityResponse();
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_entity",
        arguments: { id: "Q42", properties: ["P31"], resolve_labels: false },
    });

    const payload = JSON.parse(result.content[0].text);
    assert.deepEqual(Object.keys(payload.claims), ["P31"]);
    assert.deepEqual(payload.referenced_labels, {});
    assert.equal(payload.total_claims, 5);
});

test("reports a missing entity", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            entities: { Q999999999: { id: "Q999999999", missing: "" } },
        }),
    );
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_entity",
        arguments: { id: "Q999999999" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No Wikidata entity Q999999999/);
});

test("rejects malformed ids before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_entity",
        arguments: { id: "not-an-id" },
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("maps upstream failures to tool errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("rate limited", { status: 429 }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_entities",
        arguments: { query: "anything" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Wikidata search error \(429\)/);
});
