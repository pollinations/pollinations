import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithOpenRouterGemini } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
} as never;

const ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";

function transcribe(
    overrides: Partial<Parameters<typeof transcribeWithOpenRouterGemini>[0]>,
) {
    return transcribeWithOpenRouterGemini({
        file: new File(["audio"], "audio.wav", { type: "audio/wav" }),
        apiKey: "test-key",
        log,
        ...overrides,
    });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
    return JSON.parse(fetchMock.mock.calls[0][1].body) as Record<
        string,
        unknown
    >;
}

describe("transcribeWithOpenRouterGemini", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("sends plain base64 audio and bills the reported audio tokens", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            Response.json({
                text: "Hello there.",
                usage: {
                    total_tokens: 30,
                    input_tokens: 30,
                    output_tokens: 0,
                    cost: 0.00006,
                },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribe({ language: "en" });

        expect(fetchMock.mock.calls[0][0]).toBe(ENDPOINT);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
            "Bearer test-key",
        );
        // Timestamps and speaker options are opt-in, so plain json omits them.
        expect(sentBody(fetchMock)).toEqual({
            model: "google/gemini-3.5-transcribe",
            input_audio: { data: btoa("audio"), format: "wav" },
            language: "en",
        });
        expect(response.headers.get("x-model-used")).toBe(
            "google/gemini-3.5-transcribe",
        );
        expect(response.headers.get("x-usage-prompt-audio-tokens")).toBe("30");
        expect(
            response.headers.get("x-usage-completion-text-tokens"),
        ).toBeNull();
        await expect(response.json()).resolves.toEqual({
            text: "Hello there.",
            usage: {
                type: "tokens",
                input_tokens: 30,
                input_token_details: { audio_tokens: 30, text_tokens: 0 },
                output_tokens: 0,
                total_tokens: 30,
            },
        });
    });

    it("bills output tokens if OpenRouter starts reporting them", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                Response.json({
                    text: "hi",
                    usage: { input_tokens: 570, output_tokens: 90 },
                }),
            ),
        );

        const response = await transcribe({});

        expect(response.headers.get("x-usage-prompt-audio-tokens")).toBe("570");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "90",
        );
    });

    it("requests words for verbose_json and derives duration from tokens", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            Response.json({
                text: "Hello there.",
                task: "transcribe",
                segments: [{ id: 0, start: 0, end: 0.8, text: "Hello there." }],
                words: [
                    { word: "Hello", start: 0.2, end: 0.5 },
                    { word: "there.", start: 0.5, end: 0.8 },
                ],
                usage: { input_tokens: 570, output_tokens: 0 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribe({ responseFormat: "verbose_json" });

        expect(sentBody(fetchMock)).toMatchObject({
            response_format: "verbose_json",
            timestamp_granularities: ["segment", "word"],
        });
        expect(sentBody(fetchMock)).not.toHaveProperty("provider");
        await expect(response.json()).resolves.toMatchObject({
            text: "Hello there.",
            duration: 22.8,
            words: [
                { word: "Hello", start: 0.2, end: 0.5 },
                { word: "there.", start: 0.5, end: 0.8 },
            ],
            segments: [{ id: 0, start: 0, end: 0.8, text: "Hello there." }],
            usage: { type: "tokens", input_tokens: 570 },
        });
    });

    it("enables Google speaker diarization and groups words by speaker", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            Response.json({
                text: "Hi there.Yes I did.",
                words: [
                    { word: "Hi", start: 0.3, end: 0.5, speaker: 0 },
                    { word: "there.", start: 0.5, end: 0.9, speaker: 0 },
                    { word: "Yes", start: 5.2, end: 5.4, speaker: 1 },
                    { word: "I", start: 5.4, end: 5.5, speaker: 1 },
                    { word: "did.", start: 5.5, end: 5.9, speaker: 1 },
                ],
                usage: { input_tokens: 369, output_tokens: 0 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribe({
            file: new File(["audio"], "call.MP3"),
            responseFormat: "diarized_json",
        });

        expect(sentBody(fetchMock)).toMatchObject({
            input_audio: { format: "mp3" },
            response_format: "verbose_json",
            timestamp_granularities: ["segment", "word"],
            provider: {
                options: {
                    "google-ai-studio": { diarization_mode: "speaker" },
                },
            },
        });
        await expect(response.json()).resolves.toMatchObject({
            text: "Hi there. Yes I did.",
            segments: [
                { speaker: "0", text: "Hi there.", start: 0.3, end: 0.9 },
                { speaker: "1", text: "Yes I did.", start: 5.2, end: 5.9 },
            ],
            usage: { type: "tokens", input_tokens: 369 },
        });
    });

    it("resolves the audio format from the MIME type when the name has no extension", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ text: "x", usage: { input_tokens: 5 } }),
            );
        vi.stubGlobal("fetch", fetchMock);

        await transcribe({
            file: new File(["audio"], "blob", { type: "audio/mpeg" }),
        });

        expect(sentBody(fetchMock)).toMatchObject({
            input_audio: { format: "mp3" },
        });
    });

    it("rejects unsupported formats before calling OpenRouter", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            transcribe({
                file: new File(["x"], "clip.mp4", { type: "video/mp4" }),
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            transcribe({ responseFormat: "srt" }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects responses without valid token usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(Response.json({ text: "hello" }))
                .mockResolvedValueOnce(
                    Response.json({
                        text: "hello",
                        usage: { input_tokens: 0 },
                    }),
                ),
        );

        await expect(transcribe({})).rejects.toMatchObject({ status: 502 });
        await expect(transcribe({})).rejects.toMatchObject({ status: 502 });
    });

    it("fails clearly when OpenRouter is not configured", async () => {
        await expect(transcribe({ apiKey: "" })).rejects.toMatchObject({
            status: 500,
        });
    });
});
