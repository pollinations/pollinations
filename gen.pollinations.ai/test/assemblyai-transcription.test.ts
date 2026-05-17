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

    it("forwards speaker_labels + speakers_expected and surfaces utterances", async () => {
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
                    text: "hello there general kenobi",
                    audio_duration: 8,
                    language_code: "en_us",
                    speech_model_used: "universal-3-pro",
                    words: [
                        {
                            text: "hello",
                            start: 0,
                            end: 500,
                            speaker: "A",
                        },
                        {
                            text: "there",
                            start: 600,
                            end: 1200,
                            speaker: "A",
                        },
                        {
                            text: "general",
                            start: 2000,
                            end: 2500,
                            speaker: "B",
                        },
                        {
                            text: "kenobi",
                            start: 2600,
                            end: 3400,
                            speaker: "B",
                        },
                    ],
                    utterances: [
                        {
                            speaker: "A",
                            text: "hello there",
                            start: 0,
                            end: 1200,
                            confidence: 0.95,
                        },
                        {
                            speaker: "B",
                            text: "general kenobi",
                            start: 2000,
                            end: 3400,
                            confidence: 0.92,
                        },
                    ],
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithAssemblyAi({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            model: "universal-3-pro",
            apiKey: "test-key",
            responseFormat: "verbose_json",
            speakerLabels: true,
            speakersExpected: 2,
            log,
        });

        const submitBody = JSON.parse(
            (fetchMock.mock.calls[1][1] as RequestInit).body as string,
        );
        expect(submitBody).toMatchObject({
            speaker_labels: true,
            speakers_expected: 2,
        });

        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toMatchObject({
            text: "hello there general kenobi",
            utterances: [
                {
                    speaker: "A",
                    text: "hello there",
                    start: 0,
                    end: 1.2,
                    confidence: 0.95,
                },
                {
                    speaker: "B",
                    text: "general kenobi",
                    start: 2,
                    end: 3.4,
                    confidence: 0.92,
                },
            ],
        });
        const words = body.words as { word: string; speaker?: string }[];
        expect(words[0]).toMatchObject({ word: "hello", speaker: "A" });
        expect(words[3]).toMatchObject({ word: "kenobi", speaker: "B" });
    });

    it("supports OpenAI-compatible diarized_json responses", async () => {
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
                    text: "hello there general kenobi",
                    audio_duration: 8,
                    language_code: "en_us",
                    speech_model_used: "universal-3-pro",
                    utterances: [
                        {
                            speaker: "A",
                            text: "hello there",
                            start: 0,
                            end: 1200,
                        },
                        {
                            speaker: "B",
                            text: "general kenobi",
                            start: 2000,
                            end: 3400,
                        },
                    ],
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithAssemblyAi({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            model: "universal-3-pro",
            apiKey: "test-key",
            responseFormat: "diarized_json",
            log,
        });

        const submitBody = JSON.parse(
            (fetchMock.mock.calls[1][1] as RequestInit).body as string,
        );
        expect(submitBody).toMatchObject({
            speaker_labels: true,
        });

        await expect(response.json()).resolves.toMatchObject({
            task: "transcribe",
            duration: 8,
            text: "hello there general kenobi",
            segments: [
                {
                    type: "transcript.text.segment",
                    id: "seg_001",
                    speaker: "A",
                    text: "hello there",
                    start: 0,
                    end: 1.2,
                },
                {
                    type: "transcript.text.segment",
                    id: "seg_002",
                    speaker: "B",
                    text: "general kenobi",
                    start: 2,
                    end: 3.4,
                },
            ],
            usage: {
                type: "duration",
                seconds: 8,
            },
        });
    });

    it("omits speaker_labels from upstream when not requested", async () => {
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
                    text: "hi",
                    audio_duration: 1,
                    speech_model_used: "universal-2",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        await transcribeWithAssemblyAi({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            model: "universal-2",
            apiKey: "test-key",
            log,
        });

        const submitBody = JSON.parse(
            (fetchMock.mock.calls[1][1] as RequestInit).body as string,
        );
        expect(submitBody).not.toHaveProperty("speaker_labels");
        expect(submitBody).not.toHaveProperty("speakers_expected");
    });

    it("classifies bad audio AssemblyAI failures as client errors", async () => {
        const clientErrorMessages = [
            "language_detection cannot be performed on files with no spoken audio.",
            "Transcoding failed. File does not appear to contain audio. File type is text/plain (ASCII text).",
        ];

        for (const message of clientErrorMessages) {
            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(
                    jsonResponse({
                        upload_url:
                            "https://cdn.assemblyai.com/upload/test-audio",
                    }),
                )
                .mockResolvedValueOnce(jsonResponse({ id: "transcript-id" }))
                .mockResolvedValueOnce(
                    jsonResponse({
                        id: "transcript-id",
                        status: "error",
                        error: message,
                    }),
                );
            vi.stubGlobal("fetch", fetchMock);

            await expect(
                transcribeWithAssemblyAi({
                    file: new File(["audio"], "audio.mp3", {
                        type: "audio/mpeg",
                    }),
                    model: "universal-2",
                    apiKey: "test-key",
                    log,
                }),
            ).rejects.toMatchObject({
                status: 400,
                message,
            });
        }
    });
});
