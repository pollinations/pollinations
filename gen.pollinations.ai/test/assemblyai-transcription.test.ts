import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithAssemblyAi } from "../src/routes/assemblyai-transcription.ts";

const log = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
} as never;

function jsonResponse(body: unknown): Response {
    return Response.json(body);
}

describe("transcribeWithAssemblyAi", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("submits Universal-3 Pro with Universal-2 fallback and bills the model used", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    upload_url: "https://cdn.assemblyai.com/upload/test-audio",
                }),
            )
            .mockResolvedValueOnce(jsonResponse({ id: "transcript-id" }))
            .mockResolvedValueOnce(
                jsonResponse({
                    id: "transcript-id",
                    status: "completed",
                    text: "hello world",
                    audio_duration: 12,
                    language_code: "en_us",
                    speech_model_used: "universal-2",
                    words: [
                        { text: "hello", start: 0, end: 500 },
                        { text: "world", start: 600, end: 1200 },
                    ],
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithAssemblyAi({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            model: "universal-3-pro",
            apiKey: "test-key",
            responseFormat: "verbose_json",
            language: "en",
            prompt: "Names include Pollinations.",
            temperature: 0,
            log,
        });

        expect(response.headers.get("x-model-used")).toBe("universal-2");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("12");
        await expect(response.json()).resolves.toMatchObject({
            text: "hello world",
            language: "en_us",
            duration: 12,
            words: [
                { word: "hello", start: 0, end: 0.5 },
                { word: "world", start: 0.6, end: 1.2 },
            ],
        });

        const submitBody = JSON.parse(
            (fetchMock.mock.calls[1][1] as RequestInit).body as string,
        );
        expect(submitBody).toMatchObject({
            audio_url: "https://cdn.assemblyai.com/upload/test-audio",
            speech_models: ["universal-3-pro", "universal-2"],
            language_code: "en_us",
            prompt: "Names include Pollinations.",
            temperature: 0,
        });
    });

    it("returns subtitle text with usage headers", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    upload_url: "https://cdn.assemblyai.com/upload/test-audio",
                }),
            )
            .mockResolvedValueOnce(jsonResponse({ id: "transcript-id" }))
            .mockResolvedValueOnce(
                jsonResponse({
                    id: "transcript-id",
                    status: "completed",
                    text: "hello world",
                    audio_duration: 3,
                    speech_model_used: "universal-3-pro",
                }),
            )
            .mockResolvedValueOnce(new Response("WEBVTT\n\n00:00.000 -->"));
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithAssemblyAi({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            model: "universal-3-pro",
            apiKey: "test-key",
            responseFormat: "vtt",
            log,
        });

        expect(response.headers.get("x-model-used")).toBe("universal-3-pro");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("3");
        await expect(response.text()).resolves.toContain("WEBVTT");
        expect(fetchMock.mock.calls[3][0]).toBe(
            "https://api.assemblyai.com/v2/transcript/transcript-id/vtt",
        );
    });
});
