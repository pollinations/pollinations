import { describe, expect, it } from "vitest";
import { mapVertexGeminiImageUsage } from "../../src/image/vertexAIImageGenerator.ts";

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

    it("rejects missing usage metadata", () => {
        expect(() => mapVertexGeminiImageUsage({})).toThrow(
            "Vertex AI response missing billing usage metadata",
        );
    });

    it("rejects missing modality details", () => {
        expect(() =>
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 11,
                    candidatesTokenCount: 1120,
                    totalTokenCount: 1131,
                    candidatesTokensDetails: [
                        { modality: "IMAGE", tokenCount: 1120 },
                    ],
                },
            }),
        ).toThrow(
            "Vertex AI response missing promptTokensDetails billing usage",
        );
    });

    it("rejects modality details that do not match their aggregate", () => {
        expect(() =>
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 12,
                    candidatesTokenCount: 1120,
                    totalTokenCount: 1132,
                    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
                    candidatesTokensDetails: [
                        { modality: "IMAGE", tokenCount: 1120 },
                    ],
                },
            }),
        ).toThrow(
            "Vertex AI prompt billing usage does not match its aggregate",
        );
    });

    it("rejects candidate usage without an output image", () => {
        expect(() =>
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 11,
                    candidatesTokenCount: 23,
                    totalTokenCount: 34,
                    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
                    candidatesTokensDetails: [
                        { modality: "TEXT", tokenCount: 23 },
                    ],
                },
            }),
        ).toThrow(
            "Vertex AI image response missing output image billing usage",
        );
    });

    it("rejects unsupported completion modalities", () => {
        expect(() =>
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 11,
                    candidatesTokenCount: 1120,
                    totalTokenCount: 1131,
                    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
                    candidatesTokensDetails: [
                        { modality: "AUDIO", tokenCount: 1120 },
                    ],
                },
            }),
        ).toThrow(
            "Vertex AI returned unsupported candidatesTokensDetails modality",
        );
    });

    it("rejects totals that omit billable reasoning usage", () => {
        expect(() =>
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 11,
                    candidatesTokenCount: 1120,
                    totalTokenCount: 1131,
                    thoughtsTokenCount: 140,
                    promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
                    candidatesTokensDetails: [
                        { modality: "IMAGE", tokenCount: 1120 },
                    ],
                },
            }),
        ).toThrow("Vertex AI billing usage does not match its total");
    });
});
