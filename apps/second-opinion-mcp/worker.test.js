import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { DEFAULT_MODELS } from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "second-opinion-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://second-opinion-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

function chatResponse(text) {
    return Response.json({ choices: [{ message: { content: text } }] });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://second-opinion-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://second-opinion-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);

    const missing = await worker.fetch(
        new Request("https://second-opinion-mcp.pollinations.ai/mcp"),
    );
    assert.equal(missing.status, 404);
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://second-opinion-mcp.pollinations.ai", {
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

test("lists the second_opinion tool", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        ["second_opinion"],
    );
});

test("asks every default model with the caller's key", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), CHAT_URL);
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        const body = JSON.parse(init.body);
        assert.deepEqual(body.messages, [
            { role: "user", content: "Is 17 prime?" },
        ]);
        seen.push(body.model);
        return chatResponse(`answer from ${body.model}`);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "second_opinion",
        arguments: { question: "Is 17 prime?" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(seen.sort(), [...DEFAULT_MODELS].sort());
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.question, "Is 17 prime?");
    assert.deepEqual(
        payload.results.map((r) => r.model),
        DEFAULT_MODELS,
    );
    assert.equal(payload.results[0].answer, `answer from ${DEFAULT_MODELS[0]}`);
});

test("uses the requested models once each", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        seen.push(JSON.parse(init.body).model);
        return chatResponse("ok");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "second_opinion",
        arguments: { question: "Hi", models: ["a/one", "b/two", "a/one"] },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(seen.sort(), ["a/one", "b/two"]);
});

test("reports a failing model without dropping the others", async (t) => {
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const { model } = JSON.parse(init.body);
        if (model === "bad/model") {
            return new Response("nope", { status: 400 });
        }
        return chatResponse("fine");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "second_opinion",
        arguments: { question: "Hi", models: ["bad/model", "good/model"] },
    });
    assert.notEqual(result.isError, true);
    const [bad, good] = JSON.parse(result.content[0].text).results;
    assert.equal(bad.model, "bad/model");
    assert.ok(bad.error);
    assert.equal(good.answer, "fine");
});

test("flags an error when every model fails", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        return new Response("nope", { status: 400 });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "second_opinion",
        arguments: { question: "Hi" },
    });
    assert.equal(result.isError, true);
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const args of [
        { question: "" },
        { question: "Hi", models: [] },
        { question: "Hi", models: ["a", "b", "c", "d", "e", "f"] },
    ]) {
        const result = await client.callTool({
            name: "second_opinion",
            arguments: args,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
