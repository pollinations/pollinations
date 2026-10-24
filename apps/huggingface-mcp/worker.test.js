import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["model_info", "search_models", "space_info"];
const ORIGIN = "https://huggingface-mcp.pollinations.ai";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "huggingface-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(new URL(ORIGIN), {
        fetch: localFetch,
        requestInit: {
            headers: { Authorization: `Bearer ${token}` },
        },
    });
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="huggingface-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(new Request(`${ORIGIN}/mcp`));
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
        new Request(ORIGIN, {
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

async function callTool(name, args) {
    const client = await connectClient();
    try {
        const result = await client.callTool({ name, arguments: args });
        const text = result.content[0].text;
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { isError: result.isError === true, data };
    } finally {
        await client.close();
    }
}

test("searches models with task filter, sort and bounded output", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://huggingface.co");
        assert.equal(url.pathname, "/api/models");
        assert.equal(url.searchParams.get("search"), "whisper");
        assert.equal(
            url.searchParams.get("filter"),
            "automatic-speech-recognition",
        );
        assert.equal(url.searchParams.get("limit"), "5");
        assert.equal(url.searchParams.get("sort"), "downloads");
        assert.equal(url.searchParams.get("direction"), "-1");
        return Response.json([
            {
                id: "openai/whisper-large-v3",
                pipeline_tag: "automatic-speech-recognition",
                downloads: 5000000,
                likes: 4000,
                ignored_field: "dropped",
            },
            { id: "no-task/model" },
        ]);
    });
    const { isError, data } = await callTool("search_models", {
        query: "whisper",
        task: "automatic-speech-recognition",
        limit: 5,
    });
    assert.equal(isError, false);
    assert.deepEqual(data, {
        query: "whisper",
        task: "automatic-speech-recognition",
        count: 2,
        models: [
            {
                id: "openai/whisper-large-v3",
                task: "automatic-speech-recognition",
                downloads: 5000000,
                likes: 4000,
            },
            { id: "no-task/model", task: null, downloads: null, likes: null },
        ],
    });
    assert.equal(fetchMock.mock.callCount(), 1);
});

test("reads model details with license and capped tags", async (t) => {
    const tags = Array.from({ length: 30 }, (_, index) => `tag-${index}`);
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://huggingface.co/api/models/openai/whisper-large-v3",
        );
        return Response.json({
            id: "openai/whisper-large-v3",
            pipeline_tag: "automatic-speech-recognition",
            downloads: 5000000,
            likes: 4000,
            library_name: "transformers",
            lastModified: "2026-10-01T00:00:00.000Z",
            cardData: { license: "apache-2.0" },
            tags: ["automatic-speech-recognition", ...tags],
        });
    });
    const { isError, data } = await callTool("model_info", {
        id: "openai/whisper-large-v3",
    });
    assert.equal(isError, false);
    assert.deepEqual(data, {
        id: "openai/whisper-large-v3",
        task: "automatic-speech-recognition",
        downloads: 5000000,
        likes: 4000,
        license: "apache-2.0",
        library: "transformers",
        lastModified: "2026-10-01T00:00:00.000Z",
        tags: ["automatic-speech-recognition", ...tags.slice(0, 19)],
    });
    assert.equal(data.tags.length, 20);
});

test("falls back to license tags when card data is missing", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            id: "repo/name",
            tags: ["license:mit", "text-generation"],
        }),
    );
    const { data } = await callTool("model_info", { id: "repo/name" });
    assert.equal(data.license, "mit");
    assert.deepEqual(data.tags, ["license:mit", "text-generation"]);
});

test("reports Space SDK and runtime stage", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://huggingface.co/api/spaces/org/demo-space",
        );
        return Response.json({
            id: "org/demo-space",
            sdk: "gradio",
            likes: 120,
            lastModified: "2026-09-30T00:00:00.000Z",
            tags: ["gradio"],
            runtime: { stage: "RUNNING" },
        });
    });
    const { isError, data } = await callTool("space_info", {
        id: "org/demo-space",
    });
    assert.equal(isError, false);
    assert.deepEqual(data, {
        id: "org/demo-space",
        sdk: "gradio",
        likes: 120,
        stage: "RUNNING",
        lastModified: "2026-09-30T00:00:00.000Z",
        tags: ["gradio"],
    });
});

test("surfaces Hub errors as facts instead of tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "Model repo not found" }, { status: 404 }),
    );
    const { isError, data } = await callTool("model_info", {
        id: "missing/model",
    });
    assert.equal(isError, false);
    assert.deepEqual(data, { status: 404, error: "Model repo not found" });
});

test("surfaces network failures instead of tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const { isError, data } = await callTool("search_models", {
        query: "gpt",
    });
    assert.equal(isError, false);
    assert.deepEqual(data, { status: null, error: "fetch failed" });
});

test("rejects unsafe ids before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    for (const id of [
        "https://evil.test/x",
        "../secret",
        "a/b/c",
        "has space/x",
    ]) {
        const { isError, data } = await callTool("model_info", { id });
        assert.equal(isError, true, `expected ${id} to be rejected`);
        assert.match(data, /repo id/);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
