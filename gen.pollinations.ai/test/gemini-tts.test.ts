import { describe, expect, it } from "vitest";
import {
    generateGeminiSpeech,
    parseGeminiSpeechResponse,
} from "../src/routes/audio.ts";

// Usage shape captured from a real Gemini Developer API TTS response. Internal
// invocation counts differ from billable input/output and must not be added.
function speechResponse() {
    return {
        status: "completed",
        usage: {
            total_tokens: 81,
            total_input_tokens: 5,
            total_output_tokens: 76,
            input_tokens_by_modality: [{ modality: "text", tokens: 5 }],
            output_tokens_by_modality: [{ modality: "audio", tokens: 76 }],
            total_cached_tokens: 0,
            total_thought_tokens: 0,
            total_tool_use_tokens: 0,
            raw_prompt_token: 290,
            model_invocation_token_counts: [
                {
                    prompt_tokens_details: [
                        { modality: "text", tokens: 64 },
                        { modality: "audio", tokens: 201 },
                    ],
                    candidates_tokens_details: [
                        { modality: "text", tokens: 61 },
                    ],
                },
            ],
        },
        steps: [
            {
                content: [
                    {
                        type: "audio",
                        mime_type: "audio/l16; rate=24000; channels=1",
                        data: "AQIDBA==",
                    },
                ],
            },
        ],
    };
}

describe("Gemini Developer API speech", () => {
    it("uses reported billable tokens rather than duration or internal invocation counts", () => {
        const { bytes, usage } = parseGeminiSpeechResponse(
            speechResponse(),
            "pcm",
        );
        expect([...bytes]).toEqual([1, 2, 3, 4]);
        expect(usage).toEqual({
            promptTextTokens: 5,
            completionAudioTokens: 76,
        });
    });
    it("rejects missing usage", () => {
        const { usage: _, ...data } = speechResponse();
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "invalid usage",
        );
    });
    it.each([
        NaN,
        Infinity,
        -1,
        1.5,
        0,
    ])("rejects invalid audio token count %s", (tokens) => {
        const data = speechResponse();
        data.usage.total_output_tokens = tokens;
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "invalid usage",
        );
    });
    it("rejects inconsistent modality usage", () => {
        const data = speechResponse();
        data.usage.output_tokens_by_modality[0].tokens = 75;
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "inconsistent",
        );
    });
    it.each([
        "total_cached_tokens",
        "total_thought_tokens",
        "total_tool_use_tokens",
    ] as const)("rejects unpriced %s", (field) => {
        const data = speechResponse();
        data.usage[field] = 1;
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "invalid usage",
        );
    });
    it("rejects incomplete generations", () => {
        const data = speechResponse();
        data.status = "incomplete";
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "incomplete",
        );
    });
    it("rejects empty audio", () => {
        const data = speechResponse();
        data.steps[0].content[0].data = "";
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow("missing");
    });
    it("rejects odd-length PCM", () => {
        const data = speechResponse();
        data.steps[0].content[0].data = "AQID";
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "truncated",
        );
    });
    it("rejects unexpected formats", () => {
        expect(() =>
            parseGeminiSpeechResponse(speechResponse(), "wav"),
        ).toThrow("unexpected");
    });
    it("rejects invalid base64", () => {
        const data = speechResponse();
        data.steps[0].content[0].data = "!!!!";
        expect(() => parseGeminiSpeechResponse(data, "pcm")).toThrow(
            "encoding",
        );
    });
    it.each([
        "mp3",
        "opus",
        "aac",
        "flac",
    ])("rejects explicit %s before any provider request", async (responseFormat) => {
        await expect(
            generateGeminiSpeech({
                modelName: "google/gemini-3.8-flash-tts",
                text: "Hello",
                voice: "Kore",
                responseFormat,
                log: {} as never,
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
    it("rejects an unknown voice before any provider request", async () => {
        await expect(
            generateGeminiSpeech({
                modelName: "google/gemini-3.8-flash-tts",
                text: "Hello",
                voice: "missing",
                responseFormat: "wav",
                log: {} as never,
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});
