import { env, SELF } from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
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
            modelName: "elevenflash",
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
                modelName: "elevenlabs",
                text: "Hi",
                voice: "nova",
                responseFormat: "mp3",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});

for (const testCase of [
    { model: "elevenlabs", format: "mp3", magic: "ID3" },
    { model: "elevenflash", format: "wav", magic: "RIFF" },
    { model: "eleven-multilingual-v2", format: "opus", magic: "OggS" },
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
