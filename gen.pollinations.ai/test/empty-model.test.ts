import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";
import worker from "../src/index.ts";
import { CreateSpeechRequestSchema } from "../src/routes/audio.ts";

afterEach(teardownFetchMock);

// An explicit empty string must fail instead of silently using the default.
it.each([
    [
        "image model",
        CreateImageRequestSchema,
        { prompt: "a red apple", model: "" },
    ],
    [
        "image edit model",
        CreateImageEditRequestSchema,
        {
            prompt: "make it blue",
            image: "https://example.com/image.png",
            model: "",
        },
    ],
    [
        "embedding model",
        CreateEmbeddingRequestSchema,
        { input: "hello", model: "" },
    ],
    [
        "speech voice",
        CreateSpeechRequestSchema,
        { model: "elevenlabs/eleven-v3", input: "hello", voice: "" },
    ],
])("the schema rejects an empty %s", (_name, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
});

const speech = { input: "hello", voice: "alloy", model: "" };

test.for([
    {
        name: "JSON speech",
        path: "/v1/audio/speech",
        fields: speech,
        json: true,
    },
    { name: "multipart speech", path: "/v1/audio/speech", fields: speech },
    {
        name: "multipart transcription",
        path: "/v1/audio/transcriptions",
        fields: { model: "" },
    },
    {
        name: "timestamped speech",
        path: "/v1/audio/speech/with-timestamps",
        fields: speech,
    },
])(
    "rejects an empty model in a $name request",
    async ({ path, fields, json }, { apiKey }) => {
        const mocks = createFetchMock({ tinybird: createMockTinybird() });
        await mocks.enable("tinybird");
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, value);

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://gen.pollinations.ai${path}`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    ...(json && { "content-type": "application/json" }),
                },
                body: json ? JSON.stringify(fields) : form,
            }),
            env,
            ctx,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { message: expect.stringContaining("model") },
        });
        await waitOnExecutionContext(ctx);
    },
);

// A model of the wrong type must be a 400, never a 500 from string methods on
// the value downstream.
test.for([
    {
        name: "JSON speech with an object model",
        path: "/v1/audio/speech",
        body: { input: "hello", voice: "alloy", model: {} },
    },
    {
        name: "JSON speech with a number model",
        path: "/v1/audio/speech",
        body: { input: "hello", voice: "alloy", model: 7 },
    },
    {
        name: "JSON image edit with a boolean model",
        path: "/v1/images/edits",
        body: {
            prompt: "make it blue",
            image: "https://example.com/image.png",
            model: true,
        },
    },
])(
    "rejects a non-string model in a $name request",
    async ({ path, body }, { apiKey }) => {
        const mocks = createFetchMock({ tinybird: createMockTinybird() });
        await mocks.enable("tinybird");

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://gen.pollinations.ai${path}`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify(body),
            }),
            env,
            ctx,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { message: expect.stringContaining("model") },
        });
        await waitOnExecutionContext(ctx);
    },
);

test.for([
    {
        name: "transcription",
        path: "/v1/audio/transcriptions",
        fields: { file: "audio" },
    },
    {
        name: "voice changer",
        path: "/v1/audio/voice-changer",
        fields: { file: "audio" },
    },
    {
        name: "image edit",
        path: "/v1/images/edits",
        fields: { prompt: "make it blue", image: "image" },
    },
])(
    "rejects a file in the model field of a $name request",
    async ({ path, fields }, { apiKey }) => {
        const mocks = createFetchMock({ tinybird: createMockTinybird() });
        await mocks.enable("tinybird");
        const form = new FormData();
        for (const [key, value] of Object.entries(fields))
            form.set(
                key,
                new Blob(["x"], {
                    type: value === "audio" ? "audio/mpeg" : "image/png",
                }),
                value,
            );
        // A file in the model field: FormData.get("model") returns a File.
        form.set("model", new Blob(["m"], { type: "text/plain" }), "m.txt");

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://gen.pollinations.ai${path}`, {
                method: "POST",
                headers: { authorization: `Bearer ${apiKey}` },
                body: form,
            }),
            env,
            ctx,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { message: expect.stringContaining("model") },
        });
        await waitOnExecutionContext(ctx);
    },
);
