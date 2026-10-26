import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["get_icon", "search_icons"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "icons-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://icons-mcp.pollinations.ai"),
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

function searchResponse() {
    return Response.json({
        icons: [
            "material-symbols:shopping-cart",
            "mdi:cart",
            "lucide:shopping-cart",
        ],
        total: 3,
        limit: 64,
        start: 0,
        collections: {
            "material-symbols": {
                name: "Material Symbols",
                total: 15_744,
                author: {
                    name: "Google",
                    url: "https://github.com/google/material-design-icons",
                },
                license: {
                    title: "Apache 2.0",
                    spdx: "Apache-2.0",
                    url: "https://github.com/google/material-design-icons/blob/master/LICENSE",
                },
                category: "Material",
                samples: ["home", "settings"],
            },
            mdi: {
                name: "Material Design Icons",
                total: 7_447,
                author: {
                    name: "Pictogrammers",
                    url: "https://github.com/Templarian/MaterialDesign",
                },
                license: {
                    title: "Apache 2.0",
                    spdx: "Apache-2.0",
                    url: "https://github.com/Templarian/MaterialDesign/blob/master/LICENSE",
                },
                category: "Material",
            },
            lucide: {
                name: "Lucide",
                total: 1_600,
                author: {
                    name: "Lucide",
                    url: "https://github.com/lucide-icons/lucide",
                },
                license: {
                    title: "ISC",
                    spdx: "ISC",
                    url: "https://github.com/lucide-icons/lucide/blob/main/LICENSE",
                },
                category: "UI 24px",
            },
        },
    });
}

function svgResponse() {
    return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
        { headers: { "Content-Type": "image/svg+xml" } },
    );
}

function collectionsResponse() {
    return Response.json({
        mdi: {
            name: "Material Design Icons",
            total: 7_447,
            author: {
                name: "Pictogrammers",
                url: "https://github.com/Templarian/MaterialDesign",
            },
            license: {
                title: "Apache 2.0",
                spdx: "Apache-2.0",
                url: "https://github.com/Templarian/MaterialDesign/blob/master/LICENSE",
            },
            category: "Material",
            samples: ["home", "settings"],
        },
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://icons-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://icons-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="icons-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://icons-mcp.pollinations.ai/mcp"),
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
        new Request("https://icons-mcp.pollinations.ai", {
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

test("searches icons without forwarding the Pollinations key", async (t) => {
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
        name: "search_icons",
        arguments: {
            query: "shopping cart",
            prefix: "mdi",
            limit: 32,
            start: 64,
        },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://api.iconify.design");
    assert.equal(seen.url.pathname, "/search");
    assert.equal(seen.url.searchParams.get("query"), "shopping cart");
    assert.equal(seen.url.searchParams.get("prefix"), "mdi");
    assert.equal(seen.url.searchParams.get("limit"), "32");
    assert.equal(seen.url.searchParams.get("start"), "64");
    assert.equal(
        new Headers(seen.init.headers).get("authorization"),
        null,
        "the caller's key must not reach Iconify",
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.query, "shopping cart");
    assert.equal(payload.prefix, "mdi");
    assert.equal(payload.icon_count, 3);
    assert.equal(payload.has_more, false);
    assert.equal(payload.next_start, null);
    assert.deepEqual(payload.icons, [
        "material-symbols:shopping-cart",
        "mdi:cart",
        "lucide:shopping-cart",
    ]);
    assert.equal(payload.collections.mdi.name, "Material Design Icons");
    assert.equal(payload.collections.mdi.license.spdx, "Apache-2.0");
    assert.equal(payload.collections.mdi.author, "Pictogrammers");
    assert.equal(payload.collections.mdi.samples, undefined);
});

test("uses the default page size and reports more results", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input) => {
        seen = new URL(String(input));
        return Response.json({
            icons: Array.from(
                { length: 64 },
                (_, index) => `mdi:icon-${index}`,
            ),
            total: 64,
            limit: 64,
            start: 0,
            collections: {},
        });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_icons",
        arguments: { query: "icon" },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.searchParams.get("limit"), "64");
    assert.equal(seen.searchParams.get("start"), "0");
    assert.equal(seen.searchParams.get("prefix"), null);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.has_more, true);
    assert.equal(payload.next_start, 64);
});

test("rejects an empty search before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_icons",
        arguments: { query: "" },
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("gets an icon as SVG with its license", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        if (url.pathname === "/mdi/home.svg") return svgResponse();
        if (url.pathname === "/collections") return collectionsResponse();
        throw new Error(`Unexpected fetch: ${url}`);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_icon",
        arguments: { name: "mdi:home", color: "#ff6600", size: 32 },
    });

    assert.notEqual(result.isError, true);
    const svgCall = calls.find((url) => url.pathname === "/mdi/home.svg");
    assert.equal(svgCall.searchParams.get("color"), "#ff6600");
    assert.equal(svgCall.searchParams.get("height"), "32");
    const collectionCall = calls.find((url) => url.pathname === "/collections");
    assert.equal(collectionCall.searchParams.get("prefix"), "mdi");

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.name, "mdi:home");
    assert.match(payload.svg, /^<svg/);
    assert.match(
        payload.url,
        /^https:\/\/api\.iconify\.design\/mdi\/home\.svg/,
    );
    assert.equal(payload.collection.name, "Material Design Icons");
    assert.equal(payload.collection.license.title, "Apache 2.0");
    assert.equal(payload.collection.author, "Pictogrammers");
});

test("rejects malformed icon names before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    for (const name of ["home", "mdi:", ":home", "MDI:Home", "mdi:../x"]) {
        const result = await client.callTool({
            name: "get_icon",
            arguments: { name },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("maps upstream errors to tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/collections") return collectionsResponse();
        assert.equal(url.pathname, "/mdi/not-a-real-icon.svg");
        return new Response("Not found", { status: 404 });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_icon",
        arguments: { name: "mdi:not-a-real-icon" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Iconify error \(404\): Not found/);
});
