import { describe, expect, it } from "vitest";
import type { VertexAIUsageMetadata } from "../../src/image/vertexAIClient.ts";
import { mapVertexGeminiImageUsage } from "../../src/image/vertexAIImageGenerator.ts";

const validUsage: VertexAIUsageMetadata = {
    promptTokenCount: 11,
    candidatesTokenCount: 1120,
    totalTokenCount: 1131,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
    candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
};

describe("vertexAIImageGenerator usage mapping", () => {
    it.each([
        {
            name: "Gemini 2.5 text-to-image",
            usage: {
                promptTokenCount: 11,
                candidatesTokenCount: 1290,
                totalTokenCount: 1301,
                promptTokensDetails: [
                    { modality: "TEXT" as const, tokenCount: 11 },
                ],
                candidatesTokensDetails: [
                    { modality: "IMAGE" as const, tokenCount: 1290 },
                ],
            },
            expected: {
                promptTextTokens: 11,
                completionImageTokens: 1290,
            },
        },
        {
            name: "Gemini 3.1 image edit",
            usage: {
                promptTokenCount: 1131,
                candidatesTokenCount: 1120,
                totalTokenCount: 2251,
                promptTokensDetails: [
                    { modality: "IMAGE" as const, tokenCount: 1120 },
                    { modality: "TEXT" as const, tokenCount: 11 },
                ],
                candidatesTokensDetails: [
                    { modality: "IMAGE" as const, tokenCount: 1120 },
                ],
            },
            expected: {
                promptImageTokens: 1120,
                promptTextTokens: 11,
                completionImageTokens: 1120,
            },
        },
        {
            name: "Gemini 3 Pro image edit with reasoning",
            usage: {
                promptTokenCount: 571,
                candidatesTokenCount: 1120,
                totalTokenCount: 1831,
                thoughtsTokenCount: 140,
                promptTokensDetails: [
                    { modality: "IMAGE" as const, tokenCount: 560 },
                    { modality: "TEXT" as const, tokenCount: 11 },
                ],
                candidatesTokensDetails: [
                    { modality: "IMAGE" as const, tokenCount: 1120 },
                ],
            },
            expected: {
                promptImageTokens: 560,
                promptTextTokens: 11,
                completionImageTokens: 1120,
                completionReasoningTokens: 140,
            },
        },
    ])("maps exact provider usage for $name", ({ usage, expected }) => {
        expect(mapVertexGeminiImageUsage({ usage })).toEqual(expected);
    });

    it.each([
        ["missing metadata", undefined],
        [
            "missing modality details",
            { ...validUsage, promptTokensDetails: undefined },
        ],
        [
            "inconsistent aggregate",
            { ...validUsage, promptTokenCount: 12, totalTokenCount: 1132 },
        ],
        [
            "candidate without an image",
            {
                ...validUsage,
                candidatesTokenCount: 23,
                totalTokenCount: 34,
                candidatesTokensDetails: [
                    { modality: "TEXT" as const, tokenCount: 23 },
                ],
            },
        ],
        [
            "unsupported modality",
            {
                ...validUsage,
                candidatesTokensDetails: [
                    { modality: "AUDIO" as const, tokenCount: 1120 },
                ],
            },
        ],
        ["inconsistent total", { ...validUsage, thoughtsTokenCount: 140 }],
    ])("rejects %s", (_name, usage) => {
        expect(() => mapVertexGeminiImageUsage({ usage })).toThrow(
            "Vertex AI returned invalid billing usage metadata",
        );
    });
});
