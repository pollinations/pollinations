import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "createEmbeddings",
    "generate3D",
    "generateAudio",
    "generateImage",
    "generateText",
    "generateVideo",
    "getBalance",
    "getModelStatus",
    "listModels",
    "transformMedia",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://mcp.pollinations.ai"),
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
        new Request("https://mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves modern and legacy clients without sessions", async () => {
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

test("keeps bearer tokens scoped to each request", async (t) => {
    const originalFetch = globalThis.fetch;
    const seenAuthorizations = new Set();
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/account/balance",
        );
        const authorization = new Headers(init?.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return Response.json({
            balance: authorization === "Bearer pk_first" ? 1 : 2,
        });
    };

    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");

    const [first, second] = await Promise.all([
        firstClient.callTool({ name: "getBalance", arguments: {} }),
        secondClient.callTool({ name: "getBalance", arguments: {} }),
    ]);
    assert.match(first.content[0].text, /"pollen": 1/);
    assert.match(second.content[0].text, /"pollen": 2/);
    assert.deepEqual(
        seenAuthorizations,
        new Set(["Bearer pk_first", "Bearer sk_second"]),
    );

    await Promise.all([firstClient.close(), secondClient.close()]);
});

test("uploads generated images and returns an MCP resource link", async (t) => {
    const originalFetch = globalThis.fetch;
    let generationBody;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.equal(
            new Headers(init?.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        if (url === "https://gen.pollinations.ai/v1/images/generations") {
            generationBody = JSON.parse(init.body);
            return Response.json({
                created: 1,
                data: [
                    {
                        url: "https://gen.pollinations.ai/image/a%20bee",
                    },
                ],
            });
        }
        if (url === "https://gen.pollinations.ai/image/a%20bee") {
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "image/png" },
            });
        }
        if (url === "https://media.pollinations.ai/upload") {
            const file = init.body.get("file");
            assert.equal(file.type, "image/png");
            assert.deepEqual(
                new Uint8Array(await file.arrayBuffer()),
                new Uint8Array([1, 2, 3]),
            );
            assert.equal(init.body.get("tags"), null);
            return Response.json({
                url: "https://media.pollinations.ai/generated-image",
            });
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "generateImage",
        arguments: { prompt: "a bee" },
    });
    assert.deepEqual(result.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/generated-image",
        name: "Generated image",
        mimeType: "image/png",
    });
    assert.deepEqual(generationBody, {
        prompt: "a bee",
        response_format: "url",
    });

    await client.close();
});

test("transforms media and returns an MCP resource link", async (t) => {
    const originalFetch = globalThis.fetch;
    let transformBody;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.equal(
            new Headers(init?.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        if (url === "https://gen.pollinations.ai/v1/media/transforms") {
            transformBody = JSON.parse(init.body);
            return new Response(new Uint8Array([7, 8, 9]), {
                headers: { "content-type": "audio/mp4" },
            });
        }
        if (url === "https://media.pollinations.ai/upload") {
            const file = init.body.get("file");
            assert.equal(file.type, "audio/mp4");
            assert.deepEqual(
                new Uint8Array(await file.arrayBuffer()),
                new Uint8Array([7, 8, 9]),
            );
            return Response.json({
                url: "https://media.pollinations.ai/transformed-audio",
            });
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const result = await client.callTool({
        name: "transformMedia",
        arguments: {
            source: "https://example.com/input.mp4",
            mode: "audio",
            time: 2,
            duration: 4,
        },
    });

    assert.deepEqual(transformBody, {
        source: "https://example.com/input.mp4",
        mode: "audio",
        time: 2,
        duration: 4,
    });
    assert.deepEqual(result.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/transformed-audio",
        name: "Transformed media",
        mimeType: "audio/mp4",
    });
    await client.close();
});

test("proxies discovery and uploads generated audio, video, and 3D", async (t) => {
    const originalFetch = globalThis.fetch;
    const seen = [];
    const uploadedTypes = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        seen.push({
            url,
            authorization: new Headers(init.headers).get("authorization"),
        });

        if (url.endsWith("/audio/models?community=false")) {
            return Response.json([{ name: "speech-test" }]);
        }
        if (url.endsWith("/video/models")) {
            return Response.json([{ name: "veo" }]);
        }
        if (url.endsWith("/v1/models/status?minutes=15")) {
            return Response.json({ data: [{ model: "speech-test" }] });
        }
        if (url.endsWith("/v1/embeddings")) {
            assert.deepEqual(JSON.parse(init.body), { input: "hello" });
            return Response.json({
                object: "list",
                data: [{ object: "embedding", embedding: [0.5], index: 0 }],
                model: "embedding-test",
                usage: { prompt_tokens: 1, total_tokens: 1 },
            });
        }
        if (url.endsWith("/3d/a%20bee")) {
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "model/gltf-binary" },
            });
        }
        if (url.endsWith("/video/a%20bee?model=veo")) {
            return new Response(new Uint8Array([4, 5, 6]), {
                headers: { "Content-Type": "video/mp4" },
            });
        }
        if (url.endsWith("/audio/hello?model=speech-test")) {
            return new Response(new Uint8Array([7, 8, 9]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        if (url === "https://media.pollinations.ai/upload") {
            const file = init.body.get("file");
            uploadedTypes.push(file.type);
            return Response.json({
                url: `https://media.pollinations.ai/${uploadedTypes.length}`,
            });
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const models = await client.callTool({
        name: "listModels",
        arguments: { type: "audio", community: false },
    });
    assert.match(models.content[0].text, /speech-test/);

    const status = await client.callTool({
        name: "getModelStatus",
        arguments: { minutes: 15 },
    });
    assert.match(status.content[0].text, /speech-test/);

    const embeddings = await client.callTool({
        name: "createEmbeddings",
        arguments: { input: "hello" },
    });
    assert.match(embeddings.content[0].text, /embedding-test/);

    const model3d = await client.callTool({
        name: "generate3D",
        arguments: { prompt: "a bee" },
    });
    assert.deepEqual(model3d.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/1",
        name: "Generated 3D model",
        mimeType: "model/gltf-binary",
    });

    const video = await client.callTool({
        name: "generateVideo",
        arguments: { prompt: "a bee" },
    });
    assert.deepEqual(video.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/2",
        name: "Generated video",
        mimeType: "video/mp4",
    });

    const audio = await client.callTool({
        name: "generateAudio",
        arguments: { text: "hello", model: "speech-test" },
    });
    assert.deepEqual(audio.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/3",
        name: "Generated audio",
        mimeType: "audio/mpeg",
    });
    assert.deepEqual(uploadedTypes, [
        "model/gltf-binary",
        "video/mp4",
        "audio/mpeg",
    ]);

    assert.ok(
        seen.every(({ authorization }) => authorization === `Bearer ${TOKEN}`),
    );
    await client.close();
});
