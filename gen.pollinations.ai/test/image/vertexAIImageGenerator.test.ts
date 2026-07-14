import { describe, expect, it } from "vitest";
import {
    mapVertexGeminiImageUsage,
    NANOBANANA_MODELS,
} from "../../src/image/vertexAIImageGenerator.ts";

describe("vertexAIImageGenerator usage mapping", () => {
    it.each([
        {
            model: "nanobanana",
            vertexModel: "gemini-2.5-flash-image",
            promptTokenCount: 300,
            promptImageTokens: 258,
            promptTextTokens: 42,
        },
        {
            model: "nanobanana-2",
            vertexModel: "gemini-3.1-flash-image",
            promptTokenCount: 1200,
            promptImageTokens: 1120,
            promptTextTokens: 80,
        },
        {
            model: "nanobanana-2-lite",
            vertexModel: "gemini-3.1-flash-lite-image",
            promptTokenCount: 1200,
            promptImageTokens: 1120,
            promptTextTokens: 80,
        },
        {
            model: "nanobanana-pro",
            vertexModel: "gemini-3-pro-image",
            promptTokenCount: 600,
            promptImageTokens: 560,
            promptTextTokens: 40,
        },
    ] as const)("$model maps aggregate prompt usage into billable fields", ({
        model,
        vertexModel,
        promptTokenCount,
        promptImageTokens,
        promptTextTokens,
    }) => {
        const modelConfig = NANOBANANA_MODELS[model];

        expect(modelConfig.vertex).toBe(vertexModel);
        expect(
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount,
                    candidatesTokenCount: 1120,
                    totalTokenCount: promptTokenCount + 1137,
                    thoughtsTokenCount: 17,
                },
                modelConfig,
                referenceImageCount: 1,
            }),
        ).toEqual({
            promptImageTokens,
            promptTextTokens,
            completionImageTokens: 1120,
            completionReasoningTokens: 17,
        });
    });

    it("uses Vertex modality details when present", () => {
        expect(
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 999,
                    promptTokensDetails: [
                        { modality: "TEXT", tokenCount: 13 },
                        { modality: "IMAGE", tokenCount: 560 },
                    ],
                    candidatesTokenCount: 1205,
                    candidatesTokensDetails: [
                        { modality: "TEXT", tokenCount: 5 },
                        { modality: "IMAGE", tokenCount: 1200 },
                    ],
                    totalTokenCount: 2211,
                    thoughtsTokenCount: 6,
                },
                modelConfig: NANOBANANA_MODELS["nanobanana-pro"],
                referenceImageCount: 0,
            }),
        ).toEqual({
            promptTextTokens: 13,
            promptImageTokens: 560,
            completionTextTokens: 5,
            completionImageTokens: 1200,
            completionReasoningTokens: 6,
        });
    });

    it("maps prompt-only generations to prompt text tokens", () => {
        expect(
            mapVertexGeminiImageUsage({
                usage: {
                    promptTokenCount: 31,
                    candidatesTokenCount: 1120,
                    totalTokenCount: 1151,
                },
                modelConfig: NANOBANANA_MODELS["nanobanana-pro"],
                referenceImageCount: 0,
            }),
        ).toEqual({
            promptTextTokens: 31,
            completionImageTokens: 1120,
        });
    });
});
