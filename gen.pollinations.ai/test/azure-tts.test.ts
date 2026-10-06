import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { generateAzureSpeech } from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

describe("Azure TTS", () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        ["openai/tts-1", "tts"],
        ["openai/tts-1-hd", "tts-hd"],
    ] as const)("routes %s to its Azure deployment and bills characters", async (modelName, deployment) => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await generateAzureSpeech({
            modelName,
            text: "Hi 🌻",
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-key",
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toContain(
            `/deployments/${deployment}/audio/speech`,
        );
        expect(request.headers.get("api-key")).toBe("test-key");
        await expect(request.json()).resolves.toEqual({
            model: modelName.slice("openai/".length),
            input: "Hi 🌻",
            voice: "alloy",
            response_format: "mp3",
        });
        expect(response.headers.get("x-model-used")).toBe(modelName);
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "4",
        );
    });

    it("forwards the OpenAI speed parameter", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(new Uint8Array([1])));
        vi.stubGlobal("fetch", fetchMock);

        await generateAzureSpeech({
            modelName: "openai/tts-1",
            text: "Hi",
            voice: "alloy",
            responseFormat: "mp3",
            speed: 1.5,
            apiKey: "test-key",
        });

        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            speed: 1.5,
        });
    });

    it("rejects input beyond Azure's 4096-character limit", async () => {
        await expect(
            generateAzureSpeech({
                modelName: "openai/tts-1",
                text: "a".repeat(4097),
                voice: "alloy",
                responseFormat: "mp3",
                apiKey: "test-key",
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});

workerTest(
    "rejects a non-default speed on models without speed control",
    async ({ paidApiKey }) => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "elevenlabs/eleven-v3",
                    input: "Do not call the provider.",
                    speed: 1.5,
                }),
            }),
            withInlineGenerationCoordinator(env),
            ctx,
        );

        try {
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toMatchObject({
                error: {
                    message: expect.stringContaining(
                        "only supported by openai/tts-1",
                    ),
                },
            });
        } finally {
            await waitOnExecutionContext(ctx);
        }
    },
);
