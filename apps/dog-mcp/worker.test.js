import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "test-token";
const EXPECTED_TOOLS = ["dogImageByBreed", "listBreeds", "randomDog"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "dog-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://dog-mcp.pollinations.ai"),
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
        new Request("https://dog-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://dog-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="dog-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://dog-mcp.pollinations.ai/mcp"),
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
        new Request("https://dog-mcp.pollinations.ai", {
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

const BREEDS_BODY = {
    message: {
        affenpinscher: [],
        airedale: [],
        bulldog: ["boston", "english", "french"],
        retriever: ["chesapeake", "curly", "flat-coated", "golden"],
    },
    status: "success",
};

const RANDOM_BODY = {
    message: "https://images.dog.ceo/breeds/retriever/golden/n02099601_123.jpg",
    status: "success",
};

test("listBreeds queries Dog CEO breeds endpoint without caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://dog.ceo");
        assert.equal(url.pathname, "/api/breeds/list");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("authorization"), null);
        return Response.json(BREEDS_BODY);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({ name: "listBreeds", arguments: {} });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.count, 4);
    assert.deepEqual(report.breeds, [
        { breed: "affenpinscher", subBreeds: [] },
        { breed: "airedale", subBreeds: [] },
        { breed: "bulldog", subBreeds: ["boston", "english", "french"] },
        {
            breed: "retriever",
            subBreeds: ["chesapeake", "curly", "flat-coated", "golden"],
        },
    ]);
});

test("randomDog queries Dog CEO random endpoint without caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://dog.ceo");
        assert.equal(url.pathname, "/api/breeds/image/random");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("authorization"), null);
        return Response.json(RANDOM_BODY);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({ name: "randomDog", arguments: {} });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.image, RANDOM_BODY.message);
});

test("dogImageByBreed queries breed endpoint without caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://dog.ceo");
        assert.equal(url.pathname, "/api/breed/retriever/images/random");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("authorization"), null);
        return Response.json(RANDOM_BODY);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "dogImageByBreed",
        arguments: { breed: "retriever" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.breed, "retriever");
    assert.equal(report.image, RANDOM_BODY.message);
});

test("dogImageByBreed reports upstream errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "Breed not found" }, { status: 404 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "dogImageByBreed",
        arguments: { breed: "nowheredog" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Breed not found/);
});

test("rejects empty breed before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "dogImageByBreed",
        arguments: { breed: "" },
    });
    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});
