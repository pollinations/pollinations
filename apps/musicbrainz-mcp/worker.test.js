import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["artist_releases", "search_artists"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "musicbrainz-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://musicbrainz-mcp.pollinations.ai"),
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
        new Request("https://musicbrainz-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
        name: "musicbrainz-mcp",
        transport: "streamable-http",
        endpoint: "/",
        stateless: true,
    });

    const unauthorized = await worker.fetch(
        new Request("https://musicbrainz-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="musicbrainz-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://musicbrainz-mcp.pollinations.ai/mcp"),
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
        new Request("https://musicbrainz-mcp.pollinations.ai", {
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
    const body = await response.json();
    assert.equal(body.error, "invalid_request");
});

const RADIOHEAD = {
    created: "2026-10-22T08:00:00",
    count: 1,
    offset: 0,
    artists: [
        {
            id: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
            name: "Radiohead",
            "sort-name": "Radiohead",
            type: "Group",
            country: "GB",
            area: {
                id: "8a754a16-0027-3a29-b6d7-2b40ea0481ed",
                name: "United Kingdom",
            },
            "life-span": { begin: "1985", end: null, ended: false },
            disambiguation: "",
            score: 100,
        },
    ],
};

test("search_artists queries MusicBrainz without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://musicbrainz.org");
        assert.equal(url.pathname, "/ws/2/artist");
        assert.equal(url.searchParams.get("query"), "radiohead");
        assert.equal(url.searchParams.get("fmt"), "json");
        assert.equal(url.searchParams.get("limit"), "2");
        const headers = new Headers(init.headers);
        assert.equal(
            headers.get("authorization"),
            null,
            "caller credentials must not reach MusicBrainz",
        );
        assert.match(
            headers.get("user-agent"),
            /pollinations-musicbrainz-mcp\//,
        );
        return Response.json(RADIOHEAD);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_artists",
        arguments: { query: "radiohead", limit: 2 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.query, "radiohead");
    assert.equal(report.count, 1);
    assert.deepEqual(report.results, [
        {
            id: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
            name: "Radiohead",
            sort_name: "Radiohead",
            type: "Group",
            country: "GB",
            area: "United Kingdom",
            begin: "1985",
            end: null,
            disambiguation: "",
            score: 100,
        },
    ]);
});

test("search_artists defaults the limit to 5", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("limit"), "5");
        return Response.json(RADIOHEAD);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_artists",
        arguments: { query: "radiohead" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).count, 1);
});

test("search_artists reports empty results as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            created: "2026-10-22",
            count: 0,
            offset: 0,
            artists: [],
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_artists",
        arguments: { query: "zzzznope" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No artists found for zzzznope/);
});

const RELEASES = {
    created: "2026-10-22T08:00:00",
    count: 1,
    offset: 0,
    releases: [
        {
            id: "b1a9c0b0-0000-4000-8000-000000000001",
            title: "OK Computer",
            status: "Official",
            date: "1997-05-21",
            country: "GB",
            barcode: "7243 8 55229 2 6",
            quality: "normal",
            "artist-credit": [
                {
                    name: "Radiohead",
                    artist: {
                        id: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
                        name: "Radiohead",
                    },
                },
            ],
            "label-info": [
                {
                    "catalog-number": "7243 8 55229 2 6",
                    label: {
                        id: "64cd23b3-6fda-4a1f-9d8f-2f0f1b2b0c3d",
                        name: "Parlophone",
                    },
                },
            ],
            media: [
                {
                    format: "CD",
                    "track-count": 2,
                    track: [
                        {
                            id: "t1",
                            number: "1",
                            title: "Airbag",
                            length: 284000,
                        },
                        {
                            id: "t2",
                            number: "2",
                            title: "Paranoid Android",
                            length: 383000,
                        },
                    ],
                },
            ],
            tags: [
                { name: "rock", count: 5 },
                { name: "alternative", count: 2 },
            ],
        },
    ],
};

test("artist_releases queries MusicBrainz without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://musicbrainz.org");
        assert.equal(url.pathname, "/ws/2/release");
        assert.equal(
            url.searchParams.get("artist"),
            "a74b1b7f-71a5-4011-9441-d0b5e4122711",
        );
        assert.equal(url.searchParams.get("fmt"), "json");
        assert.equal(url.searchParams.get("limit"), "10");
        assert.equal(url.searchParams.get("inc"), "labels+tags");
        const headers = new Headers(init.headers);
        assert.equal(
            headers.get("authorization"),
            null,
            "caller credentials must not reach MusicBrainz",
        );
        assert.match(
            headers.get("user-agent"),
            /pollinations-musicbrainz-mcp\//,
        );
        return Response.json(RELEASES);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "artist_releases",
        arguments: {
            artist_id: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
            limit: 10,
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.artist_id, "a74b1b7f-71a5-4011-9441-d0b5e4122711");
    assert.equal(report.count, 1);
    const release = report.results[0];
    assert.equal(release.title, "OK Computer");
    assert.equal(release.status, "Official");
    assert.equal(release.date, "1997-05-21");
    assert.equal(release.country, "GB");
    assert.equal(release.artist, "Radiohead");
    assert.equal(release.label, "Parlophone");
    assert.equal(release.catalog_number, "7243 8 55229 2 6");
    assert.deepEqual(release.tracks, [
        { number: "1", title: "Airbag", length_ms: 284000 },
        { number: "2", title: "Paranoid Android", length_ms: 383000 },
    ]);
    assert.deepEqual(release.tags, [
        { name: "rock", count: 5 },
        { name: "alternative", count: 2 },
    ]);
});

test("artist_releases maps empty label-info to null label fields", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            releases: [
                {
                    ...RELEASES.releases[0],
                    "label-info": [],
                    media: [
                        {
                            format: "Digital Media",
                            "track-count": 1,
                            track: [{ id: "t1", number: "1", title: "Airbag" }],
                        },
                    ],
                },
            ],
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "artist_releases",
        arguments: { artist_id: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    });
    assert.notEqual(result.isError, true);
    const release = JSON.parse(result.content[0].text).results[0];
    assert.equal(release.label, null);
    assert.equal(release.catalog_number, null);
    assert.deepEqual(release.tracks, [
        { number: "1", title: "Airbag", length_ms: null },
    ]);
});

test("artist_releases reports empty results as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ releases: [] }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "artist_releases",
        arguments: { artist_id: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No releases found for artist/);
});

test("maps MusicBrainz error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "invalid inc parameter" }, { status: 400 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_artists", { query: "radiohead" }],
        [
            "artist_releases",
            { artist_id: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
        ],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /invalid inc parameter/);
    }
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_artists", { query: "radiohead" }],
        [
            "artist_releases",
            { artist_id: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
        ],
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
        ["search_artists", {}],
        ["search_artists", { query: "" }],
        ["search_artists", { query: "radiohead", limit: 0 }],
        ["search_artists", { query: "radiohead", limit: 11 }],
        ["search_artists", { query: "radiohead", limit: 1.5 }],
        ["artist_releases", {}],
        ["artist_releases", { artist_id: "" }],
        ["artist_releases", { artist_id: "x", limit: 0 }],
        ["artist_releases", { artist_id: "x", limit: 26 }],
        ["artist_releases", { artist_id: "x", limit: 2.5 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
