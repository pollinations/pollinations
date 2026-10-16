import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["osv_query", "osv_vulnerability"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "osv-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://osv-mcp.pollinations.ai"),
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
        new Request("https://osv-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://osv-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="osv-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://osv-mcp.pollinations.ai/mcp"),
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
        new Request("https://osv-mcp.pollinations.ai", {
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

const QUERY = { ecosystem: "npm", name: "lodash", version: "4.17.20" };
const ADVISORY = {
    id: "GHSA-35jh-r3h4-6jhm",
    aliases: ["CVE-2021-23337"],
    summary: "Command Injection in lodash",
    affected: [
        {
            package: { ecosystem: "npm", name: "lodash" },
            ranges: [
                {
                    type: "SEMVER",
                    events: [{ introduced: "0" }, { fixed: "4.17.21" }],
                },
            ],
        },
    ],
    references: [
        {
            type: "ADVISORY",
            url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
        },
    ],
};

test("queries OSV without forwarding caller credentials and preserves pagination", async (t) => {
    const bodies = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), "https://api.osv.dev/v1/query");
        assert.equal(init.method, "POST");
        assert.deepEqual(Object.fromEntries(new Headers(init.headers)), {
            "content-type": "application/json",
        });
        assert.equal(init.redirect, "manual");
        assert.ok(init.signal instanceof AbortSignal);
        bodies.push(JSON.parse(init.body));
        return Response.json(
            bodies.length === 1
                ? { vulns: [ADVISORY], next_page_token: "next-page" }
                : {},
        );
    });
    const client = await connectClient();
    t.after(() => client.close());
    const first = await client.callTool({
        name: "osv_query",
        arguments: QUERY,
    });
    assert.notEqual(first.isError, true);
    assert.deepEqual(JSON.parse(first.content[0].text), {
        vulns: [ADVISORY],
        next_page_token: "next-page",
    });
    const second = await client.callTool({
        name: "osv_query",
        arguments: { ...QUERY, pageToken: "next-page" },
    });
    assert.notEqual(second.isError, true);
    assert.deepEqual(JSON.parse(second.content[0].text), {});
    assert.deepEqual(bodies, [
        { package: { ecosystem: "npm", name: "lodash" }, version: "4.17.20" },
        {
            package: { ecosystem: "npm", name: "lodash" },
            version: "4.17.20",
            page_token: "next-page",
        },
    ]);
});

test("returns the complete advisory including fixes and references", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(
            String(input),
            `https://api.osv.dev/v1/vulns/${ADVISORY.id}`,
        );
        assert.equal(new Headers(init.headers).has("authorization"), false);
        assert.equal(new Headers(init.headers).has("cookie"), false);
        return Response.json(ADVISORY);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "osv_vulnerability",
        arguments: { id: ADVISORY.id },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), ADVISORY);
});

test("rejects empty queries and advisory path injection before fetching", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const arguments_ of [
        { ...QUERY, name: " " },
        { ...QUERY, version: "" },
        { ...QUERY, ecosystem: "" },
        { ...QUERY, pageToken: "" },
    ]) {
        assert.equal(
            (
                await client.callTool({
                    name: "osv_query",
                    arguments: arguments_,
                })
            ).isError,
            true,
        );
    }
    for (const id of [
        "../query",
        "https://evil.example/",
        "GHSA-123?x=1",
        "GHSA-123#x",
        "%2e%2e",
        "",
    ]) {
        assert.equal(
            (
                await client.callTool({
                    name: "osv_vulnerability",
                    arguments: { id },
                })
            ).isError,
            true,
        );
    }
    assert.equal(upstream.mock.callCount(), 0);
});

test("reports upstream errors as tool errors instead of empty vulnerability results", async (t) => {
    let response;
    t.mock.method(globalThis, "fetch", async () => response());
    const client = await connectClient();
    t.after(() => client.close());
    for (const tool of [
        { name: "osv_query", arguments: QUERY },
        { name: "osv_vulnerability", arguments: { id: ADVISORY.id } },
    ]) {
        for (const status of [302, 400, 404, 429, 503]) {
            response = () => new Response("upstream error", { status });
            const result = await client.callTool(tool);
            assert.equal(result.isError, true);
            assert.match(
                result.content[0].text,
                new RegExp(`OSV returned HTTP ${status}`),
            );
        }
        response = () => {
            throw new Error("upstream unavailable");
        };
        assert.equal((await client.callTool(tool)).isError, true);
        response = () => new Response("not JSON");
        assert.equal((await client.callTool(tool)).isError, true);
    }
});
