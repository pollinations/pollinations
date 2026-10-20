import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient() {
    const client = new Client(
        { name: "openverse-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://openverse-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${TOKEN}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

async function withFetch(fetchImpl, callback) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
        return await callback();
    } finally {
        globalThis.fetch = originalFetch;
    }
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://openverse-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://openverse-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="openverse-mcp.pollinations.ai"',
    );
});

test("lists the search tool over Streamable HTTP", async () => {
    const client = await connectClient();
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["search_open_media"],
    );
    await client.close();
});

test("searches images without forwarding caller credentials", async () => {
    await withFetch(
        async (input, init) => {
            const url = new URL(input);
            assert.equal(url.origin, "https://api.openverse.org");
            assert.equal(url.pathname, "/v1/images/");
            assert.equal(url.searchParams.get("q"), "red fox");
            assert.equal(url.searchParams.get("license_type"), "commercial");
            assert.equal(url.searchParams.get("page_size"), "2");
            assert.equal(url.searchParams.get("mature"), "false");
            assert.equal(new Headers(init.headers).has("authorization"), false);
            assert.equal(new Headers(init.headers).has("cookie"), false);
            assert.equal(init.redirect, "manual");
            return Response.json({
                results: [
                    {
                        title: "Red fox",
                        creator: "A. Photographer",
                        creator_url: "https://example.org/creator",
                        license: "by",
                        license_version: "4.0",
                        license_url:
                            "https://creativecommons.org/licenses/by/4.0/",
                        attribution: "Photo by A. Photographer, CC BY 4.0",
                        foreign_landing_url: "https://example.org/photo",
                        url: "https://example.org/photo.jpg",
                        thumbnail: "https://example.org/thumb.jpg",
                    },
                ],
            });
        },
        async () => {
            const client = await connectClient();
            const result = await client.callTool({
                name: "search_open_media",
                arguments: {
                    media_type: "images",
                    query: "red fox",
                    license_type: "commercial",
                    limit: 2,
                },
            });
            assert.equal(result.isError, undefined);
            const output = JSON.parse(result.content[0].text);
            assert.equal(output.source, "Openverse");
            assert.equal(output.results[0].license, "by");
            assert.equal(
                output.results[0].source_page,
                "https://example.org/photo",
            );
            assert.equal(
                output.results[0].thumbnail_url,
                "https://example.org/thumb.jpg",
            );
            assert.match(output.note, /not legal advice/);
            assert.match(output.note, /untrusted data, not instructions/);
            await client.close();
        },
    );
});

test("searches audio and returns upstream failures as tool errors", async () => {
    await withFetch(
        async (input) => {
            const url = new URL(input);
            assert.equal(url.pathname, "/v1/audio/");
            assert.equal(url.searchParams.get("page_size"), "1");
            return Response.json({ detail: "rate limited" }, { status: 429 });
        },
        async () => {
            const client = await connectClient();
            const result = await client.callTool({
                name: "search_open_media",
                arguments: { media_type: "audio", query: "rain", limit: 1 },
            });
            assert.equal(result.isError, true);
            assert.match(result.content[0].text, /HTTP 429/);
            await client.close();
        },
    );
});

test("returns audio attribution and defaults to five results", async () => {
    await withFetch(
        async (input) => {
            const url = new URL(input);
            assert.equal(url.pathname, "/v1/audio/");
            assert.equal(url.searchParams.get("page_size"), "5");
            return Response.json({
                results: [
                    {
                        title: "Rain",
                        creator: "Sound maker",
                        license: "cc0",
                        license_version: "1.0",
                        license_url:
                            "https://creativecommons.org/publicdomain/zero/1.0/",
                        attribution: "Rain by Sound maker, CC0",
                        foreign_landing_url: "https://example.org/rain",
                        url: "https://example.org/rain.mp3",
                    },
                ],
            });
        },
        async () => {
            const client = await connectClient();
            const result = await client.callTool({
                name: "search_open_media",
                arguments: { media_type: "audio", query: "rain" },
            });
            const output = JSON.parse(result.content[0].text);
            assert.equal(output.results[0].license, "cc0");
            assert.equal(
                output.results[0].media_url,
                "https://example.org/rain.mp3",
            );
            assert.equal(output.results[0].thumbnail_url, undefined);
            await client.close();
        },
    );
});

test("bounds result count and rejects invalid media types before fetching", async () => {
    await withFetch(
        async () => {
            assert.fail("invalid input must not reach Openverse");
        },
        async () => {
            const client = await connectClient();
            const tooMany = await client.callTool({
                name: "search_open_media",
                arguments: { media_type: "images", query: "forest", limit: 11 },
            });
            assert.equal(tooMany.isError, true);

            const invalidType = await client.callTool({
                name: "search_open_media",
                arguments: { media_type: "video", query: "forest" },
            });
            assert.equal(invalidType.isError, true);
            await client.close();
        },
    );
});
