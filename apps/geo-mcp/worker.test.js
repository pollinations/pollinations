import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "test-token";
const EXPECTED_TOOLS = ["geocode", "reverse_geocode"];
const USER_AGENT = "pollinations-geo-mcp/0.1 (https://pollinations.ai)";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "geo-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://geo-mcp.pollinations.ai"),
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
        new Request("https://geo-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://geo-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="geo-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://geo-mcp.pollinations.ai/mcp"),
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
        new Request("https://geo-mcp.pollinations.ai", {
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

const SEARCH_HITS = [
    {
        place_id: 244390759,
        lat: "28.8796553",
        lon: "78.8095335",
        class: "boundary",
        type: "administrative",
        importance: 0.62,
        name: "Moradabad",
        display_name: "Moradabad, Uttar Pradesh, India",
        address: {
            country: "India",
            country_code: "in",
            state: "Uttar Pradesh",
        },
    },
    {
        place_id: 112233,
        lat: "28.83",
        lon: "78.77",
        class: "place",
        type: "city",
        importance: 0.44,
        name: "Moradabad",
        display_name: "Moradabad, Uttar Pradesh, 244001, India",
        address: {
            country: "India",
            country_code: "in",
            state: "Uttar Pradesh",
            city: "Moradabad",
            postcode: "244001",
            road: "Civil Lines",
            suburb: "Kanth Road",
        },
    },
];

test("geocode queries Nominatim search without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://nominatim.openstreetmap.org");
        assert.equal(url.pathname, "/search");
        assert.equal(url.searchParams.get("q"), "Moradabad, India");
        assert.equal(url.searchParams.get("format"), "jsonv2");
        assert.equal(url.searchParams.get("limit"), "1");
        assert.equal(url.searchParams.get("addressdetails"), "1");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("user-agent"), USER_AGENT);
        assert.equal(
            headers.get("authorization"),
            null,
            "caller credentials must not reach Nominatim",
        );
        return Response.json(SEARCH_HITS.slice(0, 1));
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Moradabad, India" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.query, "Moradabad, India");
    assert.equal(report.count, 1);
    assert.deepEqual(report.results, [
        {
            place_id: 244390759,
            name: "Moradabad",
            display_name: "Moradabad, Uttar Pradesh, India",
            latitude: 28.8796553,
            longitude: 78.8095335,
            type: "administrative",
            category: "boundary",
            importance: 0.62,
            country: "India",
            country_code: "in",
            state: "Uttar Pradesh",
            city: null,
            postcode: null,
            road: null,
            suburb: null,
        },
    ]);
});

test("geocode returns multiple matches up to the requested limit", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("limit"), "2");
        return Response.json(SEARCH_HITS);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Moradabad, India", limit: 2 },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.count, 2);
    assert.equal(report.results[1].city, "Moradabad");
    assert.equal(report.results[1].postcode, "244001");
    assert.equal(report.results[1].road, "Civil Lines");
    assert.equal(report.results[1].suburb, "Kanth Road");
});

test("geocode reports an unknown place as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json([]));
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Nowhereville" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No places found/);
});

const REVERSE_HIT = {
    place_id: 244390759,
    lat: "28.8796553",
    lon: "78.8095335",
    class: "boundary",
    type: "administrative",
    name: "Moradabad",
    display_name: "Moradabad, Uttar Pradesh, India",
    address: {
        country: "India",
        country_code: "in",
        state: "Uttar Pradesh",
        city: "Moradabad",
        postcode: "244001",
        road: "Civil Lines",
    },
};

test("reverse_geocode queries Nominatim reverse without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://nominatim.openstreetmap.org");
        assert.equal(url.pathname, "/reverse");
        assert.equal(url.searchParams.get("lat"), "28.8796553");
        assert.equal(url.searchParams.get("lon"), "78.8095335");
        assert.equal(url.searchParams.get("format"), "jsonv2");
        assert.equal(url.searchParams.get("zoom"), "18");
        assert.equal(url.searchParams.get("addressdetails"), "1");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("user-agent"), USER_AGENT);
        assert.equal(
            headers.get("authorization"),
            null,
            "caller credentials must not reach Nominatim",
        );
        return Response.json(REVERSE_HIT);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "reverse_geocode",
        arguments: { latitude: 28.8796553, longitude: 78.8095335 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.latitude, 28.8796553);
    assert.equal(report.longitude, 78.8095335);
    assert.equal(report.name, "Moradabad");
    assert.equal(report.display_name, "Moradabad, Uttar Pradesh, India");
    assert.equal(report.type, "administrative");
    assert.equal(report.category, "boundary");
    assert.deepEqual(report.address, {
        country: "India",
        country_code: "in",
        state: "Uttar Pradesh",
        city: "Moradabad",
        postcode: "244001",
        road: "Civil Lines",
    });
});

test("maps upstream error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "Unable to geocode" }, { status: 400 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "reverse_geocode",
        arguments: { latitude: 0, longitude: 0 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unable to geocode/);
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["geocode", { query: "Delhi" }],
        ["reverse_geocode", { latitude: 28.85, longitude: 78.24 }],
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
        ["geocode", {}],
        ["geocode", { query: "" }],
        ["geocode", { query: "Delhi", limit: 0 }],
        ["geocode", { query: "Delhi", limit: 6 }],
        ["geocode", { query: "Delhi", limit: 1.5 }],
        ["reverse_geocode", { longitude: 0 }],
        ["reverse_geocode", { latitude: 0 }],
        ["reverse_geocode", { latitude: 91, longitude: 0 }],
        ["reverse_geocode", { latitude: 0, longitude: -181 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
