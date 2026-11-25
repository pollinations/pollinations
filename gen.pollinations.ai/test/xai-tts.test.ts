import { afterEach, describe, expect, it, vi } from "vitest";
import { XAI_TTS_VOICES } from "../../shared/registry/audio.ts";
import { isRetryableFallbackError } from "../src/fallback.ts";
import { generateXaiSpeech } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
} as never;

const contentTypes = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pcm: "audio/pcm",
} as const;

const voiceFormatCases = XAI_TTS_VOICES.flatMap((voice) =>
    (["mp3", "wav", "pcm"] as const).map((format) => ({ voice, format })),
);

describe("generateXaiSpeech", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it.each(voiceFormatCases)(
        "forwards voice=$voice format=$format with exact character billing",
        async ({ voice, format }) => {
            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "Content-Type": contentTypes[format] },
                }),
            );
            vi.stubGlobal("fetch", fetchMock);

            const response = await generateXaiSpeech({
                text: "Hi 🌻你好",
                voice,
                responseFormat: format,
                apiKey: "test-key",
                log,
            });

            expect(fetchMock).toHaveBeenCalledWith("https://api.x.ai/v1/tts", {
                method: "POST",
                headers: {
                    Authorization: "Bearer test-key",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: "Hi 🌻你好",
                    voice_id: voice,
                    language: "auto",
                    output_format: {
                        codec: format,
                        sample_rate: 24000,
                        ...(format === "mp3" ? { bit_rate: 128000 } : {}),
                    },
                }),
            });
            expect(response.headers.get("content-type")).toBe(
                contentTypes[format],
            );
            expect(response.headers.get("x-model-used")).toBe("x-ai/grok-tts");
            expect(response.headers.get("x-tts-voice")).toBe(voice);
            expect(
                response.headers.get("x-usage-completion-audio-tokens"),
            ).toBe("6");
        },
    );

    it("maps the existing default voice to Eve", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "audio/mpeg" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await generateXaiSpeech({
            text: "Hello",
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-key",
            log,
        });

        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            voice_id: "eve",
        });
    });

    it.each([
        [404, "TTS synthesis failed: Voice 'nyra' not found", 400, false],
        [404, "Model not found", 502, true],
        [404, "Not Found", 502, true],
        [404, "TTS synthesis failed: Voice 'eve' not found", 502, true],
        [500, "TTS synthesis failed: Voice 'nyra' not found", 500, true],
        [429, "Rate limit exceeded", 502, true],
    ])(
        "classifies upstream %s %s as %s without losing provider evidence",
        async (upstreamStatus, message, status, retryable) => {
            const responseBody = JSON.stringify({ error: message });
            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(responseBody, {
                    status: upstreamStatus as number,
                    headers: { "x-request-id": "provider-request" },
                }),
            );
            vi.stubGlobal("fetch", fetchMock);

            const error = await generateXaiSpeech({
                text: "Hello",
                voice: "nyra",
                responseFormat: "mp3",
                apiKey: "test-key",
                log,
            }).catch((error: unknown) => error);

            expect(error).toMatchObject({
                status,
                upstreamStatus,
                message,
                responseBody,
                requestUrl: new URL("https://api.x.ai/v1/tts"),
                upstreamHeaders: { "x-request-id": "provider-request" },
            });
            expect(isRetryableFallbackError(error)).toBe(retryable);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );

    it("rejects requests when xAI is not configured", async () => {
        await expect(
            generateXaiSpeech({
                text: "Hello",
                voice: "eve",
                responseFormat: "mp3",
                apiKey: "",
                log,
            }),
        ).rejects.toMatchObject({
            status: 500,
            message: "Grok TTS is not configured (missing API key)",
        });
    });
});
