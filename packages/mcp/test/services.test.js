import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";
import { audioTools } from "../src/services/audioService.js";
import { imageTools } from "../src/services/imageService.js";
import { textTools } from "../src/services/textService.js";

const context = { http: { authInfo: { token: "sk_test" } } };
const handlers = new Map(
    [...imageTools, ...textTools, ...audioTools, ...accountTools].map(
        ([name, _description, _schema, handler]) => [name, handler],
    ),
);

function mockFetch(t, implementation) {
    const original = globalThis.fetch;
    globalThis.fetch = implementation;
    t.after(() => {
        globalThis.fetch = original;
    });
}

test("registers exactly the eight low-level handlers", () => {
    assert.deepEqual([...handlers.keys()].sort(), [
        "chatCompletion",
        "generateImage",
        "generateVideo",
        "getBalance",
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
