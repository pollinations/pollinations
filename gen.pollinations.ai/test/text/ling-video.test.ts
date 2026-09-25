import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";

const videoPart = {
    type: "video_url",
    video_url: { url: "https://example.com/clip.mp4" },
};

describe("inclusionai/ling-3.0-flash-vl video input", () => {
    it("accepts video_url parts next to text and image parts", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: "inclusionai/ling-3.0-flash-vl",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What happens in this clip?" },
                        videoPart,
                    ],
                },
            ],
        });

        const content = parsed.messages[0].content as Array<{
            type: string;
        }>;
        expect(content.map((part) => part.type)).toEqual(["text", "video_url"]);
    });

    it("registers the model with text, image and video input and no fallback", () => {
        const definition = getRegistryModelDefinition(
            "inclusionai/ling-3.0-flash-vl",
        );
        expect(definition.inputModalities).toEqual(["text", "image", "video"]);
        expect(definition.cost.promptVideoTokens).toBeGreaterThan(0);
        // The pinned route must not silently fall back to another provider.
        expect(
            findModelByName("inclusionai/ling-3.0-flash-vl")?.config({
                model: "inclusionai/ling-3.0-flash-vl",
            }).defaultOptions,
        ).toMatchObject({
            provider: { only: ["deepinfra/fp16"], allow_fallbacks: false },
        });
    });
});
