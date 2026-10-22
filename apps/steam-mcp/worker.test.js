import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["game_details", "game_reviews", "search_games"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "steam-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://steam-mcp.pollinations.ai"),
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
        new Request("https://steam-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://steam-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="steam-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://steam-mcp.pollinations.ai/mcp"),
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
        new Request("https://steam-mcp.pollinations.ai", {
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

const SEARCH = {
    total: 3,
    items: [
        {
            type: "app",
            name: "The Witcher 3: Wild Hunt",
            id: 292030,
            price: { currency: "USD", initial: 4999, final: 2999 },
            tiny_image:
                "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/capsule_231x87.jpg",
        },
        {
            type: "app",
            name: "The Witcher: Enhanced Edition",
            id: 20900,
            price: { currency: "USD", initial: 999, final: 199 },
        },
        {
            type: "bundle",
            name: "The Witcher Bundle",
            id: 12345,
        },
    ],
};

test("search_games queries the store without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://store.steampowered.com");
        assert.equal(url.pathname, "/api/storesearch/");
        assert.equal(url.searchParams.get("term"), "witcher");
        assert.equal(url.searchParams.get("cc"), "us");
        assert.equal(url.searchParams.get("l"), "en");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Steam",
        );
        return Response.json(SEARCH);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_games",
        arguments: { query: "witcher" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.query, "witcher");
    assert.equal(report.count, 3);
    assert.deepEqual(report.results[0], {
        app_id: 292030,
        name: "The Witcher 3: Wild Hunt",
        type: "app",
        price: { currency: "USD", initial: 49.99, final: 29.99 },
    });
    assert.equal(report.results[2].price, null);

    const limited = await client.callTool({
        name: "search_games",
        arguments: { query: "witcher", limit: 2 },
    });
    assert.notEqual(limited.isError, true);
    const limitedReport = JSON.parse(limited.content[0].text);
    assert.equal(limitedReport.count, 2);
    assert.equal(limitedReport.results.length, 2);
});

const DETAILS = {
    "570": {
        success: true,
        data: {
            type: "game",
            name: "Dota 2",
            is_free: true,
            short_description: "A competitive MOBA from Valve.",
            detailed_description: "Long description.",
            about_the_game: "About text.",
            developers: ["Valve"],
            publishers: ["Valve"],
            platforms: { windows: true, mac: true, linux: true },
            release_date: { date: "2013-07-25", coming_soon: false },
            genres: [
                { id: "1", description: "Strategy" },
                { id: "free", description: "Free to Play" },
            ],
            categories: [
                { id: "1", description: "Multi-player" },
                { id: "9", description: "Online Co-Op" },
            ],
        },
    },
};

test("game_details reads the appdetails endpoint without caller credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://store.steampowered.com");
        assert.equal(url.pathname, "/api/appdetails");
        assert.equal(url.searchParams.get("appids"), "570");
        assert.equal(url.searchParams.get("cc"), "us");
        assert.equal(url.searchParams.get("l"), "en");
        assert.equal(url.searchParams.get("filters"), "basic");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Steam",
        );
        return Response.json(DETAILS);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "game_details",
        arguments: { app_id: 570 },
    });
    assert.notEqual(result.isError, true);
    const details = JSON.parse(result.content[0].text);
    assert.deepEqual(details, {
        app_id: 570,
        name: "Dota 2",
        type: "game",
        is_free: true,
        short_description: "A competitive MOBA from Valve.",
        developers: ["Valve"],
        publishers: ["Valve"],
        platforms: { windows: true, mac: true, linux: true },
        release_date: "2013-07-25",
        coming_soon: false,
        price: null,
        genres: ["Strategy", "Free to Play"],
        categories: ["Multi-player", "Online Co-Op"],
    });
});

test("game_details maps a paid price overview", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            "292030": {
                success: true,
                data: {
                    ...DETAILS["570"].data,
                    name: "The Witcher 3: Wild Hunt",
                    is_free: false,
                    price_overview: {
                        currency: "USD",
                        initial: 4999,
                        final: 2999,
                    },
                },
            },
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "game_details",
        arguments: { app_id: 292030 },
    });
    assert.notEqual(result.isError, true);
    const details = JSON.parse(result.content[0].text);
    assert.deepEqual(details.price, {
        currency: "USD",
        initial: 49.99,
        final: 29.99,
    });
});

test("game_details reports an unknown app as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ "999999": { success: false } }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "game_details",
        arguments: { app_id: 999999 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Steam app 999999 not found/);
});

const REVIEWS = {
    success: 1,
    query_summary: {
        num_reviews: 1,
        review_score: 8,
        review_score_desc: "Very Positive",
        total_positive: 2253291,
        total_negative: 548516,
        total_reviews: 2801807,
    },
    reviews: [
        {
            recommendationid: "189350234",
            author: {
                steamid: "76561198000000001",
                num_games: 412,
                num_reviews: 7,
            },
            language: "English",
            review: "Still the best MOBA.",
            timestamp_created: 1729000000,
            voted_up: true,
            votes_up: 12,
            weighted_vote_score: "0.8",
            comment_count: 0,
        },
    ],
};

test("game_reviews reads the appreviews endpoint without caller credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://store.steampowered.com");
        assert.equal(url.pathname, "/appreviews/570");
        assert.equal(url.searchParams.get("json"), "1");
        assert.equal(url.searchParams.get("language"), "all");
        assert.equal(url.searchParams.get("purchase_type"), "all");
        assert.equal(url.searchParams.get("num_per_page"), "5");
        assert.equal(url.searchParams.get("filter"), "recent");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Steam",
        );
        return Response.json(REVIEWS);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "game_reviews",
        arguments: { app_id: 570 },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.summary, {
        total_reviews: 2801807,
        total_positive: 2253291,
        total_negative: 548516,
        score: 8,
        score_description: "Very Positive",
    });
    assert.deepEqual(report.reviews, [
        {
            author: "76561198000000001",
            language: "English",
            positive: true,
            votes_up: 12,
            score: 0.8,
            review: "Still the best MOBA.",
            timestamp: 1729000000,
        },
    ]);
});

test("maps upstream error bodies into tool errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("Service Unavailable", { status: 503 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_games",
        arguments: { query: "witcher" },
    });
    assert.equal(result.isError, true);
    assert.match(
        result.content[0].text,
        /Steam request failed with status 503/,
    );
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_games", { query: "witcher" }],
        ["game_details", { app_id: 570 }],
        ["game_reviews", { app_id: 570 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_games", {}],
        ["search_games", { query: "" }],
        ["search_games", { query: "witcher", limit: 0 }],
        ["search_games", { query: "witcher", limit: 11 }],
        ["game_details", {}],
        ["game_details", { app_id: 0 }],
        ["game_details", { app_id: 1.5 }],
        ["game_reviews", {}],
        ["game_reviews", { app_id: -3 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
