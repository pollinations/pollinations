import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["earthquake_event", "earthquake_search"];
const NOW = Date.parse("2026-10-16T12:00:00Z");
const realFetch = globalThis.fetch;

/** A USGS GeoJSON feature as the event endpoint returns it. */
const QUAKE = {
    type: "Feature",
    id: "us6000tytg",
    properties: {
        mag: 5.3,
        magType: "mww",
        place: "NNE of Yōkaichiba, Japan",
        time: 1790857631864,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tytg",
        felt: 25,
        tsunami: 0,
        status: "reviewed",
        alert: null,
        sig: 441,
    },
    geometry: { type: "Point", coordinates: [140.5507, 35.7025, 41.649] },
};

const EVENT = {
    id: "us6000tytg",
    time: "2026-10-01T12:27:11.864Z",
    magnitude: 5.3,
    magnitude_type: "mww",
    place: "NNE of Yōkaichiba, Japan",
    depth_km: 41.649,
    latitude: 35.7025,
    longitude: 140.5507,
    tsunami: false,
    felt: 25,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tytg",
};

const COLLECTION = (features) => ({ type: "FeatureCollection", features });

beforeEach(() => {
    // Every test runs on a fixed clock, so the default window is 2026-10-09 to now.
    mock.timers.enable({ apis: ["Date"], now: NOW });
});

afterEach(() => {
    globalThis.fetch = realFetch;
    mock.timers.reset();
});

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "earthquakes-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://earthquakes-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

/** Answers USGS requests from `routes` and records what was asked. */
function mockUsgs(routes) {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({ url, headers: new Headers(init?.headers) });
        const answer = routes(url);
        return typeof answer === "number"
            ? new Response("error", { status: answer })
            : answer === null
              ? new Response("Not Found", { status: 404 })
              : Response.json(answer);
    };
    return requests;
}

const textOf = (result) => result.content[0].text;

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://earthquakes-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://earthquakes-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="earthquakes-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://earthquakes-mcp.pollinations.ai/mcp"),
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
        new Request("https://earthquakes-mcp.pollinations.ai", {
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

test("searches the default window and maps GeoJSON to events", async () => {
    const requests = mockUsgs(() => COLLECTION([QUAKE]));
    const client = await connectClient();
    const result = await client.callTool({
        name: "earthquake_search",
        arguments: {},
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), [EVENT]);
    const { url, headers } = requests[0];
    assert.equal(url.host, "earthquake.usgs.gov");
    assert.equal(url.pathname, "/fdsnws/event/1/query");
    assert.equal(url.searchParams.get("format"), "geojson");
    assert.equal(url.searchParams.get("starttime"), "2026-10-09");
    assert.equal(url.searchParams.has("endtime"), false);
    assert.equal(url.searchParams.get("minmagnitude"), "4.5");
    assert.equal(url.searchParams.get("orderby"), "time");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.has("latitude"), false);
    // Only the User-Agent goes upstream; the caller's key stays home.
    assert.equal(headers.get("authorization"), null);
    assert.match(headers.get("user-agent"), /^earthquakes-mcp\//);
});

test("treats end_date as inclusive and defaults the start to 7 days before it", async () => {
    const requests = mockUsgs(() => COLLECTION([]));
    const client = await connectClient();
    for (const args of [
        { start_date: "2026-10-01", end_date: "2026-10-02" },
        { end_date: "2026-10-02" },
        { start_date: "2026-10-01" },
        { start_date: "2025-10-15", end_date: "2026-10-16" },
    ]) {
        const result = await client.callTool({
            name: "earthquake_search",
            arguments: args,
        });
        assert.equal(result.isError, undefined, JSON.stringify(args));
    }
    await client.close();

    assert.deepEqual(
        requests.map(({ url }) => [
            url.searchParams.get("starttime"),
            url.searchParams.get("endtime"),
        ]),
        [
            ["2026-10-01", "2026-10-03"],
            ["2026-09-25", "2026-10-03"],
            ["2026-10-01", null],
            ["2025-10-15", "2026-10-17"],
        ],
    );
});

test("passes magnitude, limit and near filters upstream", async () => {
    const requests = mockUsgs(() => COLLECTION([QUAKE]));
    const client = await connectClient();
    await client.callTool({
        name: "earthquake_search",
        arguments: {
            min_magnitude: 2.5,
            limit: 3,
            order: "magnitude",
            near: { latitude: 35.68, longitude: 139.69 },
        },
    });
    await client.close();

    const query = requests[0].url.searchParams;
    assert.equal(query.get("minmagnitude"), "2.5");
    assert.equal(query.get("orderby"), "magnitude");
    assert.equal(query.get("limit"), "3");
    assert.equal(query.get("latitude"), "35.68");
    assert.equal(query.get("longitude"), "139.69");
    assert.equal(query.get("maxradiuskm"), "300");
});

test("rejects bad dates and ranges before any upstream call", async () => {
    const requests = mockUsgs(() => COLLECTION([]));
    const client = await connectClient();
    for (const args of [
        { start_date: "2026-02-30" },
        { end_date: "2025-02-29" },
        { start_date: "2026-13-01" },
        { end_date: "2026-1-5" },
        { start_date: "16/10/2026" },
        { start_date: "2026-10-05", end_date: "2026-10-04" },
        { start_date: "2026-10-17" },
        { start_date: "2020-01-01" },
        { start_date: "2025-10-14", end_date: "2026-10-16" },
    ]) {
        const outcome = await client
            .callTool({ name: "earthquake_search", arguments: args })
            .catch((error) => ({ isError: true, error }));
        assert.equal(outcome.isError, true, JSON.stringify(args));
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("reads one event with status, alert level and significance", async () => {
    const requests = mockUsgs(() => QUAKE);
    const client = await connectClient();
    const result = await client.callTool({
        name: "earthquake_event",
        arguments: { id: "us6000tytg" },
    });
    await client.close();

    assert.deepEqual(JSON.parse(textOf(result)), {
        ...EVENT,
        status: "reviewed",
        alert: null,
        significance: 441,
    });
    assert.equal(requests[0].url.searchParams.get("eventid"), "us6000tytg");
    assert.equal(requests[0].url.searchParams.get("format"), "geojson");
    assert.equal(requests[0].headers.get("authorization"), null);
});

test("rejects malformed event ids before any upstream call", async () => {
    const requests = mockUsgs(() => QUAKE);
    const client = await connectClient();
    for (const id of [
        "US6000TYTG",
        "us600",
        "us6000tytg-1",
        "../us6000tytg",
        "us6000tytg&format=xml",
        "us1111111111111",
    ]) {
        const outcome = await client
            .callTool({ name: "earthquake_event", arguments: { id } })
            .catch((error) => ({ isError: true, error }));
        assert.equal(outcome.isError, true, id);
    }
    await client.close();
    assert.equal(requests.length, 0);
});

test("reports an unknown event id as a tool error", async () => {
    mockUsgs(() => null);
    const client = await connectClient();
    const result = await client.callTool({
        name: "earthquake_event",
        arguments: { id: "us0000zzzz" },
    });
    await client.close();
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'No earthquake with id "us0000zzzz".');
});

test("returns an empty list when nothing matches", async () => {
    mockUsgs(() => COLLECTION([]));
    const client = await connectClient();
    const result = await client.callTool({
        name: "earthquake_search",
        arguments: { min_magnitude: 9.9 },
    });
    await client.close();
    assert.equal(result.isError, undefined);
    assert.equal(textOf(result), "[]");
});

test("turns a USGS outage into a tool error", async () => {
    mockUsgs(() => 503);
    const client = await connectClient();
    const search = await client.callTool({
        name: "earthquake_search",
        arguments: {},
    });
    const event = await client.callTool({
        name: "earthquake_event",
        arguments: { id: "us6000tytg" },
    });
    await client.close();
    for (const result of [search, event]) {
        assert.equal(result.isError, true);
        assert.match(textOf(result), /503/);
    }
});
