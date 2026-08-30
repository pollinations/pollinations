import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOpenRouterFishSpeech } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("OpenRouter Fish Audio TTS", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ["mp3", "audio/mpeg"],
        ["pcm", "audio/pcm;rate=44100;channels=1"],
    ])(
        "pins Fish Audio, forwards %s, and bills UTF-8 bytes",
        async (responseFormat, contentType) => {
            const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: {
                        "content-type": contentType,
                        "x-generation-id": "gen-fish-test",
                    },
                }),
            );
            const text = "Café 你好.";

            const response = await generateOpenRouterFishSpeech({
                text,
                voice: "alloy",
                responseFormat,
                apiKey: "test-openrouter-key",
                log,
            });

            const request = new Request(
                fetchMock.mock.calls[0][0],
                fetchMock.mock.calls[0][1],
            );
            expect(request.url).toBe(
                "https://openrouter.ai/api/v1/audio/speech",
            );
            await expect(request.json()).resolves.toEqual({
                model: "fish-audio/s2.1-pro",
                input: text,
                voice: "alloy",
                response_format: responseFormat,
                provider: {
                    only: ["Fish Audio"],
                    allow_fallbacks: false,
                },
            });
            expect(response.headers.get("content-type")).toBe(contentType);
            expect(response.headers.get("x-generation-id")).toBe(
                "gen-fish-test",
            );
            expect(
                response.headers.get("x-usage-completion-audio-tokens"),
            ).toBe(String(new TextEncoder().encode(text).byteLength));
        },
    );

    it.each(["opus", "aac", "flac", "wav"])(
        "rejects unsupported %s before calling OpenRouter",
        async (responseFormat) => {
            const fetchMock = vi.spyOn(globalThis, "fetch");

            await expect(
                generateOpenRouterFishSpeech({
                    text: "Hello",
                    voice: "alloy",
                    responseFormat,
                    apiKey: "test-openrouter-key",
                    log,
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});
