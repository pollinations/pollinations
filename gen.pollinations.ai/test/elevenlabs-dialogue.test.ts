import { env, SELF } from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateElevenLabsDialogue } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("ElevenLabs Text to Dialogue", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("maps preset voices and bills all input characters", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        const response = await generateElevenLabsDialogue({
            inputs: [
                { text: "Hello.", voice: "nova" },
                { text: "Hi!", voice: "george" },
            ],
            responseFormat: "mp3",
            seed: 42,
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        await expect(request.json()).resolves.toMatchObject({
            inputs: [
                { text: "Hello.", voice_id: "MF3mGyEYCl7XYWbV9V6O" },
                { text: "Hi!", voice_id: "JBFqnCBsd6RMkjVDRZzb" },
            ],
            model_id: "eleven_v3",
            seed: 42,
        });
        expect(request.url).toContain("/v1/text-to-dialogue");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "9",
        );
    });

    it("rejects inputs above the provider's reliable character limit", async () => {
        await expect(
            generateElevenLabsDialogue({
                inputs: [{ text: "x".repeat(2001), voice: "nova" }],
                responseFormat: "mp3",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});

workerTest(
    "restricts the model to its dialogue endpoint",
    async ({ paidApiKey }) => {
        const response = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "eleven-dialogue",
                    input: "This must not reach the generic speech route.",
                }),
            },
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message: expect.stringContaining("/v1/audio/dialogue"),
            },
        });
    },
);

workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
    "generates multi-speaker audio through the full local route",
    async ({ paidApiKey }) => {
        const response = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/dialogue",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "eleven-dialogue",
                    inputs: [
                        { text: "Hello.", voice: "nova" },
                        { text: "Hi!", voice: "george" },
                    ],
                    response_format: "mp3",
                }),
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("audio/mpeg");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "9",
        );
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);

        const wavResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/dialogue",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "dialogue",
                    inputs: [
                        { text: "First speaker.", voice: "rachel" },
                        { text: "Second speaker.", voice: "adam" },
                    ],
                    response_format: "wav",
                }),
            },
        );

        expect(wavResponse.status).toBe(200);
        expect(wavResponse.headers.get("content-type")).toContain("audio/wav");
        expect(wavResponse.headers.get("content-length")).not.toBeNull();
        expect((await wavResponse.arrayBuffer()).byteLength).toBeGreaterThan(
            1000,
        );
    },
);
