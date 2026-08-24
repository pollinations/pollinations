import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";
import { audioTools } from "../src/services/audioService.js";
import { discoveryTools } from "../src/services/discoveryService.js";
import { embeddingTools } from "../src/services/embeddingService.js";
import { imageTools } from "../src/services/imageService.js";
import { model3dTools } from "../src/services/model3dService.js";
import { textTools } from "../src/services/textService.js";

const context = { http: { authInfo: { token: "sk_test" } } };
const handlers = new Map(
    [
        ...imageTools,
        ...textTools,
        ...audioTools,
        ...embeddingTools,
        ...model3dTools,
        ...discoveryTools,
        ...accountTools,
    ].map(([name, _description, _schema, handler]) => [name, handler]),
);

function mockFetch(t, implementation) {
    const original = globalThis.fetch;
    globalThis.fetch = implementation;
    t.after(() => {
        globalThis.fetch = original;
    });
}

test("registers one low-level handler for every distinct capability", () => {
    assert.deepEqual([...handlers.keys()].sort(), [
        "chatCompletion",
        "createEmbeddings",
        "generate3D",
        "generateAudio",
        "generateImage",
        "generateVideo",
        "getBalance",
        "getModelStatus",
        "getUsage",
        "listModels",
        "textToSpeech",
        "transcribeAudio",
    ]);
});

test("chatCompletion rejects streaming before calling Gen", async (t) => {
    let calls = 0;
    mockFetch(t, async () => {
        calls += 1;
        return Response.json({});
    });
    await assert.rejects(
        handlers.get("chatCompletion")(
            {
                messages: [{ role: "user", content: "hello" }],
                stream: true,
            },
            context,
        ),
        /does not support streaming/,
    );
    assert.equal(calls, 0);
});

test("generateImage preserves arbitrary Gen query parameters", async (t) => {
    let requestedUrl;
    mockFetch(t, async (input) => {
        requestedUrl = String(input);
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "Content-Type": "image/png" },
        });
    });
    const result = await handlers.get("generateImage")(
        {
            prompt: "a bee",
            output: "inline",
            model: "flux",
            provider_extension: "kept",
        },
        context,
    );
    assert.equal(
        requestedUrl,
        "https://gen.pollinations.ai/image/a%20bee?model=flux&provider_extension=kept",
    );
    assert.deepEqual(result, {
        content: [
            {
                type: "image",
                data: "AQID",
                mimeType: "image/png",
            },
        ],
    });
});

test("generateVideo rejects a non-video success response", async (t) => {
    let cancelled = false;
    mockFetch(
        t,
        async () =>
            new Response(
                new ReadableStream({
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers: { "Content-Type": "application/json" } },
            ),
    );
    await assert.rejects(
        handlers.get("generateVideo")(
            { prompt: "a bee", model: "veo" },
            context,
        ),
        /Expected video response/,
    );
    assert.equal(cancelled, true);
});

test("textToSpeech forwards the raw request and wraps binary for MCP", async (t) => {
    let requestBody;
    mockFetch(t, async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/audio/speech",
        );
        assert.equal(init.headers.Authorization, "Bearer sk_test");
        requestBody = JSON.parse(init.body);
        return new Response(new Uint8Array([4, 5, 6]), {
            headers: { "Content-Type": "audio/mpeg" },
        });
    });
    const result = await handlers.get("textToSpeech")(
        {
            input: "hello",
            voice: "nova",
            provider_extension: { kept: true },
        },
        context,
    );
    assert.deepEqual(requestBody, {
        input: "hello",
        voice: "nova",
        provider_extension: { kept: true },
    });
    assert.deepEqual(result, {
        content: [{ type: "audio", data: "BAUG", mimeType: "audio/mpeg" }],
    });
});

test("createEmbeddings preserves request and response extensions", async (t) => {
    let requestBody;
    mockFetch(t, async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/embeddings",
        );
        requestBody = JSON.parse(init.body);
        return Response.json({
            data: [{ embedding: [0.1, 0.2] }],
            provider_extension: "kept",
        });
    });
    const result = await handlers.get("createEmbeddings")(
        {
            input: "hello",
            model: "embedding-model",
            provider_options: { kept: true },
        },
        context,
    );
    assert.deepEqual(requestBody, {
        input: "hello",
        model: "embedding-model",
        provider_options: { kept: true },
    });
    assert.match(result.content[0].text, /provider_extension/);
});

test("generate3D preserves Gen parameters and wraps inline GLB", async (t) => {
    let requestedUrl;
    mockFetch(t, async (input) => {
        requestedUrl = String(input);
        return new Response(new Uint8Array([7, 8, 9]), {
            headers: { "Content-Type": "model/gltf-binary" },
        });
    });
    const result = await handlers.get("generate3D")(
        {
            prompt: "a robot",
            model: "trellis-2",
            output: "inline",
            provider_extension: "kept",
        },
        context,
    );
    assert.equal(
        requestedUrl,
        "https://gen.pollinations.ai/3d/a%20robot?model=trellis-2&provider_extension=kept",
    );
    assert.deepEqual(result.content, [
        {
            type: "resource",
            resource: {
                uri: requestedUrl,
                mimeType: "model/gltf-binary",
                blob: "BwgJ",
            },
        },
    ]);
});

test("generateAudio preserves music parameters", async (t) => {
    let requestedUrl;
    mockFetch(t, async (input) => {
        requestedUrl = String(input);
        return new Response(new Uint8Array([10, 11, 12]), {
            headers: { "Content-Type": "audio/mpeg" },
        });
    });
    const result = await handlers.get("generateAudio")(
        {
            text: "upbeat jazz",
            model: "elevenmusic",
            duration: 30,
            instrumental: true,
            output: "inline",
        },
        context,
    );
    assert.equal(
        requestedUrl,
        "https://gen.pollinations.ai/audio/upbeat%20jazz?model=elevenmusic&duration=30&instrumental=true",
    );
    assert.deepEqual(result.content, [
        { type: "audio", data: "CgsM", mimeType: "audio/mpeg" },
    ]);
});

test("getModelStatus returns raw status data", async (t) => {
    let requestedUrl;
    mockFetch(t, async (input) => {
        requestedUrl = String(input);
        return Response.json({
            models: [{ name: "openai", p95_ms: 123 }],
            new_field: "kept",
        });
    });
    const result = await handlers.get("getModelStatus")(
        { minutes: 15 },
        context,
    );
    assert.equal(
        requestedUrl,
        "https://gen.pollinations.ai/v1/models/status?minutes=15",
    );
    assert.match(result.content[0].text, /new_field/);
});
