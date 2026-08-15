import { afterEach, describe, expect, it, vi } from "vitest";
import { generateElevenLabsSpeech } from "../src/routes/audio.ts";
import { simpleAudioQuerySchema } from "../src/routes/generation-handlers.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("ElevenLabs TTS model routing", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ["elevenlabs", "eleven_v3"],
        ["elevenflash", "eleven_flash_v2_5"],
        ["eleven-multilingual-v2", "eleven_multilingual_v2"],
    ] as const)("maps %s to %s", async (modelName, expectedModelId) => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await generateElevenLabsSpeech({
            modelName,
            text: "Hello",
            voice: "nova",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        await expect(request.json()).resolves.toMatchObject({
            model_id: expectedModelId,
        });
    });

    it("accepts custom voice IDs on the simple audio endpoint", () => {
        const customVoiceId = "custom-elevenlabs-voice-id";

        expect(
            simpleAudioQuerySchema.parse({ voice: customVoiceId }).voice,
        ).toBe(customVoiceId);
    });

    it("encodes custom voice IDs at the provider URL boundary", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await generateElevenLabsSpeech({
            modelName: "elevenlabs",
            text: "Hello",
            voice: "custom/voice?output_format=pcm_44100",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        const requestUrl = String(fetchMock.mock.calls[0][0]);
        expect(requestUrl).toContain(
            "/text-to-speech/custom%2Fvoice%3Foutput_format%3Dpcm_44100",
        );
        expect(new URL(requestUrl).searchParams.get("output_format")).toBe(
            "mp3_44100_128",
        );
    });
});
