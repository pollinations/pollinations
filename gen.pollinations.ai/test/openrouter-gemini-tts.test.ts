import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOpenRouterGeminiSpeech } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

const MODELS = [
    "google/gemini-3.8-flash-tts",
    "google/gemini-3.8-flash-lite-tts",
] as const;

// One second of 24 kHz mono 16-bit PCM.
const ONE_SECOND_PCM = new Uint8Array(24000 * 2).fill(7);

function mockSpeech(pcm: Uint8Array<ArrayBuffer> = ONE_SECOND_PCM) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(pcm, {
            headers: {
                "content-type": "audio/pcm;rate=24000;channels=1",
                "x-generation-id": "gen-tts-test",
            },
        }),
    );
}

async function sentBody(
    fetchMock: ReturnType<typeof mockSpeech>,
): Promise<Record<string, unknown>> {
    const request = new Request(
        fetchMock.mock.calls[0][0],
        fetchMock.mock.calls[0][1],
    );
    expect(request.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    return request.json();
}

describe("OpenRouter Gemini TTS", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(
        MODELS,
    )("pins %s to Google AI Studio, always requests pcm, and bills derived usage", async (modelName) => {
        const fetchMock = mockSpeech();
        const text = "Café 你好.";

        const response = await generateOpenRouterGeminiSpeech({
            modelName,
            text,
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-openrouter-key",
            log,
        });

        await expect(sentBody(fetchMock)).resolves.toEqual({
            model: modelName,
            input: text,
            voice: "Kore",
            response_format: "pcm",
            provider: {
                only: ["google-ai-studio"],
                allow_fallbacks: false,
            },
        });
        expect(response.headers.get("x-model-used")).toBe(modelName);
        expect(response.headers.get("x-tts-voice")).toBe("Kore");
        expect(response.headers.get("x-generation-id")).toBe("gen-tts-test");
        // 13 UTF-8 bytes at ~4 bytes/token, and 1 second at 32 tokens/second.
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("4");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "32",
        );
    });

    it("wraps PCM in a playable WAV by default", async () => {
        mockSpeech();

        const response = await generateOpenRouterGeminiSpeech({
            modelName: "google/gemini-3.8-flash-tts",
            text: "Hello",
            voice: "Puck",
            responseFormat: "wav",
            apiKey: "test-openrouter-key",
            log,
        });

        const wav = new Uint8Array(await response.arrayBuffer());
        const view = new DataView(wav.buffer);
        const ascii = (start: number, end: number) =>
            String.fromCharCode(...wav.subarray(start, end));
        expect(response.headers.get("content-type")).toBe("audio/wav");
        expect(ascii(0, 4)).toBe("RIFF");
        expect(ascii(8, 12)).toBe("WAVE");
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(24000);
        expect(view.getUint16(34, true)).toBe(16);
        expect(view.getUint32(40, true)).toBe(ONE_SECOND_PCM.byteLength);
        expect(wav.byteLength).toBe(44 + ONE_SECOND_PCM.byteLength);
        expect(wav[44]).toBe(7);
    });

    it("returns raw PCM when pcm is requested", async () => {
        mockSpeech();

        const response = await generateOpenRouterGeminiSpeech({
            modelName: "google/gemini-3.8-flash-lite-tts",
            text: "Hello",
            voice: "Puck",
            responseFormat: "pcm",
            apiKey: "test-openrouter-key",
            log,
        });

        expect(response.headers.get("content-type")).toBe(
            "audio/pcm;rate=24000;channels=1",
        );
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            ONE_SECOND_PCM,
        );
    });

    it("rounds audio tokens up to whole tokens", async () => {
        // 0.5 seconds is exactly 16 tokens; one extra sample rounds up to 17.
        mockSpeech(new Uint8Array((12000 + 1) * 2));

        const response = await generateOpenRouterGeminiSpeech({
            modelName: "google/gemini-3.8-flash-tts",
            text: "Hi",
            voice: "Kore",
            responseFormat: "pcm",
            apiKey: "test-openrouter-key",
            log,
        });

        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "17",
        );
    });

    it("accepts voice names case-insensitively and sends the canonical name", async () => {
        const fetchMock = mockSpeech();

        await generateOpenRouterGeminiSpeech({
            modelName: "google/gemini-3.8-flash-tts",
            text: "Hello",
            voice: "puck",
            responseFormat: "pcm",
            apiKey: "test-openrouter-key",
            log,
        });

        expect((await sentBody(fetchMock)).voice).toBe("Puck");
    });

    it("rejects an unknown voice before calling OpenRouter", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        await expect(
            generateOpenRouterGeminiSpeech({
                modelName: "google/gemini-3.8-flash-tts",
                text: "Hello",
                voice: "rachel",
                responseFormat: "pcm",
                apiKey: "test-openrouter-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails instead of billing zero when OpenRouter returns no audio", async () => {
        mockSpeech(new Uint8Array(0));

        await expect(
            generateOpenRouterGeminiSpeech({
                modelName: "google/gemini-3.8-flash-tts",
                text: "Hello",
                voice: "Kore",
                responseFormat: "pcm",
                apiKey: "test-openrouter-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
