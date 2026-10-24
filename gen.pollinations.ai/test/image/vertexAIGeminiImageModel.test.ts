import { describe, expect, it } from "vitest";
import {
    mapVertexGeminiImageUsage,
    type VertexGeminiImageUsage,
} from "../../src/image/models/vertexAIGeminiImageModel.ts";

const validUsage: VertexGeminiImageUsage = {
    promptTokenCount: 11,
    candidatesTokenCount: 1120,
    totalTokenCount: 1131,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
    candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
};

describe("Vertex Gemini image usage", () => {
    it("rejects cached counts that do not reconcile with their modalities", () => {
        for (const usage of [
            { ...validUsage, cachedContentTokenCount: 3 },
            {
                ...validUsage,
                cachedContentTokenCount: 12,
                cacheTokensDetails: [
                    { modality: "TEXT" as const, tokenCount: 12 },
                ],
            },
            { ...validUsage, cachedContentTokenCount: -1 },
        ]) {
            expect(() => mapVertexGeminiImageUsage(usage, true)).toThrow(
                "invalid image billing usage metadata",
            );
        }
    });
    it("subtracts cached tokens from their input modalities", () => {
        expect(
            mapVertexGeminiImageUsage(
                {
                    ...validUsage,
                    promptTokenCount: 571,
                    totalTokenCount: 1691,
                    promptTokensDetails: [
                        { modality: "TEXT", tokenCount: 11 },
                        { modality: "IMAGE", tokenCount: 560 },
                    ],
                    cachedContentTokenCount: 505,
                    cacheTokensDetails: [
                        { modality: "TEXT", tokenCount: 5 },
                        { modality: "IMAGE", tokenCount: 500 },
                    ],
                },
                true,
            ),
        ).toEqual({
            promptTextTokens: 6,
            promptImageTokens: 60,
            promptCachedTokens: 505,
            completionImageTokens: 1120,
        });
    });

    it("maps text, image, and reasoning usage exactly", () => {
        expect(
            mapVertexGeminiImageUsage({
                promptTokenCount: 571,
                candidatesTokenCount: 1120,
                thoughtsTokenCount: 140,
                totalTokenCount: 1831,
                promptTokensDetails: [
                    { modality: "IMAGE", tokenCount: 560 },
                    { modality: "TEXT", tokenCount: 11 },
                ],
                candidatesTokensDetails: [
                    { modality: "IMAGE", tokenCount: 1120 },
                ],
            }),
        ).toEqual({
            promptImageTokens: 560,
            promptTextTokens: 11,
            completionImageTokens: 1120,
            completionReasoningTokens: 140,
        });
    });

    it.each([
        ["missing metadata", undefined],
        [
            "missing modality details",
            { ...validUsage, promptTokensDetails: [] },
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
                promptTokensDetails: [
                    { modality: "VIDEO" as const, tokenCount: 11 },
                ],
            },
        ],
        ["inconsistent total", { ...validUsage, thoughtsTokenCount: 140 }],
    ])("rejects %s", (_name, usage) => {
        expect(() => mapVertexGeminiImageUsage(usage)).toThrow(
            "invalid image billing usage metadata",
        );
    });
});
