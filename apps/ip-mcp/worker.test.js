import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["ip_lookup", "my_ip"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "ip-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://ip-mcp.pollinations.ai"),
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
        new Request("https://ip-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://ip-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="ip-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://ip-mcp.pollinations.ai/mcp"),
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
        new Request("https://ip-mcp.pollinations.ai", {
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

test("ip_lookup calls ipapi.co with the address", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(String(input), "https://ipwho.is/8.8.8.8");
        assert.equal(
            new Headers(init.headers).get("accept"),
            "application/json",
        );
        return Response.json({
            ip: "8.8.8.8",
            success: true,
            type: "IPv4",
            country: "United States",
            country_code: "US",
            region: "California",
            city: "Mountain View",
            latitude: 37.4056,
            longitude: -122.0775,
            is_eu: false,
            postal: "94043",
            connection: {
                asn: "AS15169",
                org: "Google LLC",
                isp: "Google LLC",
                domain: "google.com",
            },
            timezone: { id: "America/Los_Angeles", abbr: "PDT", offset: -7 },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "ip_lookup",
        arguments: { ip: "8.8.8.8" },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.countryCode, "US");
    assert.equal(parsed.org, "Google LLC");
    assert.equal(parsed.asn, "AS15169");
    assert.equal(parsed.timezone, "America/Los_Angeles");
});

test("ip_lookup surfaces ipapi errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ success: false, message: "Invalid IP address" }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "ip_lookup",
        arguments: { ip: "999.1.1.1" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Invalid IP address/);
});

test("my_ip returns caller info", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://ipwho.is/");
        return Response.json({
            ip: "203.0.113.42",
            success: true,
            country: "Indonesia",
            country_code: "ID",
            city: "Jakarta",
            postal: "10110",
            connection: {},
            timezone: {},
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "my_ip",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ip, "203.0.113.42");
    assert.equal(parsed.country, "Indonesia");
});

test("surfaces HTTP errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("nope", { status: 503 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "ip_lookup",
        arguments: { ip: "8.8.8.8" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /503/);
});
