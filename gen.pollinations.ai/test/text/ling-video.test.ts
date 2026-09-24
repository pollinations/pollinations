import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";
import { textCapabilityError } from "../../src/text/fallbackCompatibility.js";

const videoPart = {
    type: "video_url",
    video_url: { url: "https://example.com/clip.mp4" },
};

const MODEL = "inclusionai/ling-3.0-flash-vl";

describe("inclusionai/ling-3.0-flash-vl video input", () => {
    it("accepts video_url parts next to text and image parts", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What happens in this clip?" },
                        videoPart,
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/frame.png" },
                        },
                    ],
                },
            ],
        });

        const content = parsed.messages[0].content as Array<{
            type: string;
        }>;
        expect(content.map((part) => part.type)).toEqual([
            "text",
            "video_url",
            "image_url",
        ]);
    });

    it("accepts data: URI video parts", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "video_url",
                            video_url: {
                                url: "data:video/mp4;base64,AAAAIGZ0eXBpc29t",
                            },
                        },
                    ],
                },
            ],
        });
        expect(parsed.messages).toHaveLength(1);
    });

    it("registers the model with text, image and video input", () => {
        const definition = getRegistryModelDefinition(MODEL);
        expect(definition.inputModalities).toEqual(["text", "image", "video"]);
        expect(definition.outputModalities).toEqual(["text"]);
        expect(definition.maxReferenceImages).toBe(10);
        expect(definition.maxReferenceVideos).toBe(10);
        expect(definition.paidOnly).toBe(true);
        expect(definition.tools).toBe(true);
    });

    it("prices video tokens at the route's single prompt rate", () => {
        const definition = getRegistryModelDefinition(MODEL);
        // openaiUsageToUsage emits promptVideoTokens whenever the provider
        // reports prompt_tokens_details.video_tokens; a registry price must
        // exist for that unit or the billing event drops it.
        expect(definition.cost.promptVideoTokens).toBeGreaterThan(0);
        expect(definition.cost.promptVideoTokens).toBe(
            definition.cost.promptTextTokens,
        );
    });

    it("pins the route to deepinfra/fp16 without fallback", () => {
        const config = findModelByName(MODEL)?.config({
            model: MODEL,
        });
        expect(config?.defaultOptions).toMatchObject({
            provider: { only: ["deepinfra/fp16"], allow_fallbacks: false },
        });
    });

    it("keeps fallback eligibility within the video reference limit", () => {
        const definition = getRegistryModelDefinition(MODEL);
        expect(
            textCapabilityError(definition, {
                messages: [
                    {
                        role: "user",
                        content: Array.from({ length: 10 }, () => videoPart),
                    },
                ],
            }),
        ).toBeUndefined();
        expect(
            textCapabilityError(definition, {
                messages: [
                    {
                        role: "user",
                        content: Array.from({ length: 11 }, () => videoPart),
                    },
                ],
            }),
        ).toBe("This model supports at most 10 reference videos");
    });
});
