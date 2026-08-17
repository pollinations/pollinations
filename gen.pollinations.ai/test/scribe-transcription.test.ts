import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithElevenLabs } from "../src/routes/audio.ts";

const errorLog = vi.fn();
const log = {
    error: errorLog,
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
} as never;

function jsonResponse(body: unknown, headers?: HeadersInit): Response {
    return Response.json(body, { headers });
}

describe("transcribeWithElevenLabs", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("supports OpenAI-compatible diarized_json responses", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            jsonResponse({
                text: "hello there general kenobi",
                language_code: "en",
                audio_duration_secs: 10,
                words: [
                    {
                        text: "hello",
                        start: 0,
                        end: 0.5,
                        speaker_id: "speaker_0",
                    },
                    {
                        text: " ",
                        start: 0.5,
                        end: 0.6,
                        speaker_id: null,
                        type: "spacing",
                    },
                    {
                        text: "there",
                        start: 0.6,
                        end: 1.2,
                        speaker_id: "speaker_0",
                    },
                    {
                        text: "general",
                        start: 2.0,
                        end: 2.5,
                        speaker_id: "speaker_1",
                    },
                    {
                        text: " ",
                        start: 2.5,
                        end: 2.6,
                        speaker_id: null,
                        type: "spacing",
                    },
                    {
                        text: "kenobi",
                        start: 2.6,
                        end: 3.4,
                        speaker_id: "speaker_1",
                    },
                ],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithElevenLabs({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            apiKey: "test-key",
            responseFormat: "diarized_json",
            numSpeakers: 2,
            log,
        });

        const sentFormData = fetchMock.mock.calls[0][1].body as FormData;
        expect(sentFormData.get("diarize")).toBe("true");
        expect(sentFormData.get("num_speakers")).toBe("2");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("10");

        await expect(response.json()).resolves.toMatchObject({
            task: "transcribe",
            duration: 3.4,
            text: "hello there general kenobi",
            segments: [
                {
                    type: "transcript.text.segment",
                    id: "seg_001",
                    speaker: "speaker_0",
                    text: "hello there",
                    start: 0,
                    end: 1.2,
                },
                {
                    type: "transcript.text.segment",
                    id: "seg_002",
                    speaker: "speaker_1",
                    text: "general kenobi",
                    start: 2,
                    end: 3.4,
                },
            ],
            usage: {
                type: "duration",
                seconds: 3.4,
            },
        });
    });

    it("does not send diarize or include utterances when not requested", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            jsonResponse({
                text: "hello",
                language_code: "en",
                audio_duration_secs: 0.5,
                words: [{ text: "hello", start: 0, end: 0.5 }],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithElevenLabs({
            file: new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
            apiKey: "test-key",
            log,
        });

        const sentFormData = fetchMock.mock.calls[0][1].body as FormData;
        expect(sentFormData.get("diarize")).toBeNull();
        expect(sentFormData.get("num_speakers")).toBeNull();

        const body = (await response.json()) as Record<string, unknown>;
        expect(body).not.toHaveProperty("utterances");
    });

    it("bills silent audio from provider metering", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                jsonResponse(
                    {
                        text: "",
                        language_code: "en",
                        words: [],
                    },
                    { "character-cost": "4" },
                ),
            ),
        );

        const response = await transcribeWithElevenLabs({
            file: new File(["silence"], "silence.wav", {
                type: "audio/wav",
            }),
            apiKey: "test-key",
            log,
        });

        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("10");
        await expect(response.json()).resolves.toEqual({ text: "" });
    });

    it.each([
        ["missing", undefined],
        ["zero", { "character-cost": "0" }],
    ])("fails closed when provider metering is %s", async (_, headers) => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                jsonResponse(
                    {
                        text: "hello",
                        language_code: "en",
                        words: [{ text: "hello", start: 0, end: 0.5 }],
                    },
                    headers,
                ),
            ),
        );

        await expect(
            transcribeWithElevenLabs({
                file: new File(["audio"], "audio.mp3", {
                    type: "audio/mpeg",
                }),
                apiKey: "test-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
        expect(errorLog).toHaveBeenCalledOnce();
    });
});
