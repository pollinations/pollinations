import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";
import { generateElevenLabsSpeechWithTimestamps } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

const providerResponse = {
    audio_base64: "SUQz",
    alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.1],
        character_end_times_seconds: [0.1, 0.2],
    },
    normalized_alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.1],
        character_end_times_seconds: [0.1, 0.2],
    },
};

describe("ElevenLabs timestamped TTS", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests aligned audio and attaches exact character usage", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json(providerResponse));

        const response = await generateElevenLabsSpeechWithTimestamps({
            modelName: "elevenlabs/eleven-flash-v2.5",
            text: "Hi",
            voice: "nova",
            responseFormat: "wav",
            seed: 42,
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toContain(
            "/v1/text-to-speech/MF3mGyEYCl7XYWbV9V6O/with-timestamps?output_format=wav_44100",
        );
        await expect(request.json()).resolves.toMatchObject({
            text: "Hi",
            model_id: "eleven_flash_v2_5",
            seed: 42,
        });
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "2",
        );
        await expect(response.json()).resolves.toEqual(providerResponse);
    });

    it("rejects non-JSON provider responses", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await expect(
            generateElevenLabsSpeechWithTimestamps({
                modelName: "elevenlabs/eleven-v3",
                text: "Hi",
                voice: "nova",
                responseFormat: "mp3",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("encodes custom voice IDs at the provider URL boundary", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json(providerResponse));

        await generateElevenLabsSpeechWithTimestamps({
            modelName: "elevenlabs/eleven-v3",
            text: "Hi",
            voice: "custom/voice?output_format=pcm_44100",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        const requestUrl = String(fetchMock.mock.calls[0][0]);
        expect(requestUrl).toContain(
            "/text-to-speech/custom%2Fvoice%3Foutput_format%3Dpcm_44100/with-timestamps",
        );
        expect(new URL(requestUrl).searchParams.get("output_format")).toBe(
            "mp3_44100_128",
        );
    });
});

workerTest(
    "rejects unsupported FLAC instead of returning PCM under the wrong format",
    async ({ paidApiKey }) => {
        const response = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/speech/with-timestamps",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "elevenlabs/eleven-v3",
                    input: "Do not call the provider.",
                    response_format: "flac",
                }),
            },
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message: expect.stringContaining(
                    "supports mp3, opus, aac, wav, and pcm",
                ),
            },
        });
    },
);

workerTest(
    "uses the shared fallback loop for audio",
    async ({ paidApiKey }) => {
        const source = getRegistryModelDefinition("elevenlabs/eleven-v3");
        const previousFallbacks = source.fallbacks;
        const fetchMock = vi.spyOn(globalThis, "fetch");
        try {
            source.fallbacks = ["elevenlabs/eleven-flash-v2.5"];
            resetGenerationModelRegistryCache();
            const providerModels: string[] = [];
            fetchMock.mockImplementation(async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("public_model_stats.json")) {
                    return Response.json({ data: [] });
                }
                if (
                    request.url.includes("/v0/events?name=generation_event_v2")
                ) {
                    return new Response("", { status: 202 });
                }
                const body = (await request.json()) as { model_id: string };
                providerModels.push(body.model_id);
                if (body.model_id === "eleven_v3") {
                    return Response.json(
                        { error: { message: "rate limited" } },
                        { status: 429 },
                    );
                }
                return Response.json(providerResponse);
            });

            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    "https://gen.pollinations.ai/v1/audio/speech/with-timestamps",
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${paidApiKey}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            model: "elevenlabs/eleven-v3",
                            input: "Fallback speech",
                        }),
                    },
                ),
                {
                    ...env,
                    ELEVENLABS_API_KEY: "test-eleven-key",
                } as unknown as CloudflareBindings,
                ctx,
            );

            expect(response.status).toBe(200);
            expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
                "config.targets[1]",
            );
            expect(response.headers.get("x-model-used")).toBe(
                "elevenlabs/eleven-flash-v2.5",
            );
            await response.arrayBuffer();
            await waitOnExecutionContext(ctx);
            expect(providerModels).toEqual(["eleven_v3", "eleven_flash_v2_5"]);
        } finally {
            fetchMock.mockRestore();
            source.fallbacks = previousFallbacks;
            resetGenerationModelRegistryCache();
        }
    },
);

for (const testCase of [
    { model: "elevenlabs/eleven-v3", format: "mp3", magic: "ID3" },
    { model: "elevenlabs/eleven-flash-v2.5", format: "wav", magic: "RIFF" },
    {
        model: "elevenlabs/eleven-multilingual-v2",
        format: "opus",
        magic: "OggS",
    },
] as const) {
    workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
        `returns ${testCase.format} audio and alignment for ${testCase.model}`,
        async ({ paidApiKey }) => {
            const input = "Timed speech.";
            const response = await SELF.fetch(
                "https://gen.pollinations.ai/v1/audio/speech/with-timestamps",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: testCase.model,
                        input,
                        voice: "nova",
                        response_format: testCase.format,
                    }),
                },
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain(
                "application/json",
            );
            expect(
                response.headers.get("x-usage-completion-audio-tokens"),
            ).toBe(String(input.length));
            expect(response.headers.get("x-pollinations-response-format")).toBe(
                "audio-with-timestamps",
            );

            const body = (await response.json()) as typeof providerResponse;
            expect(body.audio_base64.length).toBeGreaterThan(1000);
            const audioBytes = Uint8Array.from(
                atob(body.audio_base64),
                (character) => character.charCodeAt(0),
            );
            expect(
                String.fromCharCode(
                    ...audioBytes.slice(0, testCase.magic.length),
                ),
            ).toBe(testCase.magic);
            if (testCase.format === "wav") {
                const view = new DataView(audioBytes.buffer);
                expect(view.getUint32(4, true)).toBe(audioBytes.length - 8);
                let offset = 12;
                while (
                    offset + 8 <= audioBytes.length &&
                    String.fromCharCode(
                        ...audioBytes.slice(offset, offset + 4),
                    ) !== "data"
                ) {
                    const chunkSize = view.getUint32(offset + 4, true);
                    offset += 8 + chunkSize + (chunkSize % 2);
                }
                expect(
                    String.fromCharCode(
                        ...audioBytes.slice(offset, offset + 4),
                    ),
                ).toBe("data");
                expect(view.getUint32(offset + 4, true)).toBe(
                    audioBytes.length - offset - 8,
                );
            }
            expect(body.alignment.characters.length).toBeGreaterThan(0);
            expect(body.alignment.character_start_times_seconds.length).toBe(
                body.alignment.characters.length,
            );
            expect(body.alignment.character_end_times_seconds.length).toBe(
                body.alignment.characters.length,
            );
            expect(body.normalized_alignment.characters.length).toBeGreaterThan(
                0,
            );
        },
        30_000,
    );
}
