import { describe, expect, it } from "vitest";
import { parseGeminiLiveUsage } from "../src/routes/geminiLiveUsage.ts";

const receipt = {
    promptTokenCount: 49,
    candidatesTokenCount: 34,
    thoughtsTokenCount: 57,
    totalTokenCount: 140,
    promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 28 },
        { modality: "TEXT", tokenCount: 21 },
    ],
    candidatesTokensDetails: [
        { modality: "AUDIO", tokenCount: 31 },
        { modality: "TEXT", tokenCount: 3 },
    ],
};

describe("Gemini Live turn usage", () => {
    it("bills prior audio context, output transcription and thinking at their respective rates", () => {
        expect(parseGeminiLiveUsage(receipt)).toEqual({
            promptAudioTokens: 28,
            promptTextTokens: 21,
            completionAudioTokens: 31,
            completionTextTokens: 3,
            completionReasoningTokens: 57,
        });
    });

    it("handles a function call with no audio output", () => {
        expect(
            parseGeminiLiveUsage({
                promptTokenCount: 37,
                candidatesTokenCount: 10,
                thoughtsTokenCount: 91,
                totalTokenCount: 138,
                promptTokensDetails: [{ modality: "TEXT", tokenCount: 37 }],
                candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
            }),
        ).toEqual({
            promptTextTokens: 37,
            completionTextTokens: 10,
            completionReasoningTokens: 91,
        });
    });

    it.each([
        { promptTokensDetails: undefined },
        { candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 31 }] },
        { candidatesTokensDetails: [{ modality: "UNKNOWN", tokenCount: 34 }] },
        { totalTokenCount: 83 },
        { thoughtsTokenCount: -1 },
    ])("rejects unreconciled or invalid receipts (%j)", (changes) => {
        expect(parseGeminiLiveUsage({ ...receipt, ...changes })).toBeNull();
    });
});
