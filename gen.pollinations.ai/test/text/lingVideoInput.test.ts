import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import {
    CompletionUsageSchema,
    CreateChatCompletionRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../../src/text/fallbackCompatibility.js";
import { chatToResponsesRequest } from "../../src/text/responses/chatRequest.js";
import { resolveModelConfig } from "../../src/text/utils/modelResolver.js";

const MODEL = "inclusionai/ling-3.0-flash-vl";
const messages = [{ role: "user" as const, content: "Hello" }];
const videoPart = {
    type: "video_url",
    video_url: { url: "https://example.com/clip.mp4" },
};

function withVideos(count: number): Record<string, unknown> {
    return {
        messages: [
            {
                role: "user",
                content: Array.from({ length: count }, () => videoPart),
            },
        ],
    };
}

describe("ling-3.0-flash-vl video request handling", () => {
    it("parses video_url parts alongside text and image parts", () => {
        const request = CreateChatCompletionRequestSchema.parse({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What happens in this clip?" },
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/frame.jpg" },
                        },
                        videoPart,
                    ],
                },
            ],
        });

        const parts = request.messages[0]?.content;
        expect(Array.isArray(parts)).toBe(true);
        expect((parts as { type: string }[]).map((part) => part.type)).toEqual([
            "text",
            "image_url",
            "video_url",
        ]);
    });

    it("parses data:video URIs", () => {
        const request = CreateChatCompletionRequestSchema.parse({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "video_url",
                            video_url: {
                                url: "data:video/mp4;base64,AAAA",
                                mime_type: "video/mp4",
                            },
                        },
                    ],
                },
            ],
        });

        const parts = request.messages[0]?.content as {
            video_url: { url: string };
        }[];
        expect(parts[0]?.video_url.url).toBe("data:video/mp4;base64,AAAA");
    });

    it("keeps prompt_tokens_details.video_tokens instead of dropping it", () => {
        const parsed = CompletionUsageSchema.parse({
            prompt_tokens: 20,
            completion_tokens: 5,
            total_tokens: 25,
            prompt_tokens_details: { cached_tokens: 2, video_tokens: 5 },
        });

        expect(parsed.prompt_tokens_details?.video_tokens).toBe(5);
    });
});

describe("ling-3.0-flash-vl registry and routing", () => {
    it("declares video input with reference limits and a video rate", () => {
        const service = TEXT_SERVICES[MODEL];

        expect(service.inputModalities).toEqual(["text", "image", "video"]);
        expect(service.maxReferenceVideos).toBe(10);
        expect(service.maxReferenceImages).toBe(10);
        expect(service.paidOnly).toBe(true);
        expect(service.cost.promptVideoTokens).toBeGreaterThan(0);
        expect(service.cost.promptVideoTokens).toBe(
            service.cost.promptTextTokens,
        );
    });

    it("keeps text and image input registered", () => {
        expect(TEXT_SERVICES[MODEL].inputModalities).toContain("text");
        expect(TEXT_SERVICES[MODEL].inputModalities).toContain("image");
        expect(findModelByName(MODEL)).not.toBeNull();
    });

    it("pins the route to DeepInfra fp16 without fallback", () => {
        const result = resolveModelConfig(messages, { model: MODEL });

        expect(result.options.model).toBe(MODEL);
        expect(result.options.provider).toEqual({
            only: ["deepinfra/fp16"],
            allow_fallbacks: false,
        });
    });
});

describe("ling-3.0-flash-vl usage mapping", () => {
    it("splits provider-reported video tokens into their own priced bucket", () => {
        const usage = openaiUsageToUsage({
            prompt_tokens: 20,
            completion_tokens: 1,
            total_tokens: 21,
            prompt_tokens_details: { video_tokens: 5 },
        });

        expect(usage.promptVideoTokens).toBe(5);
        expect(usage.promptTextTokens).toBe(15);
    });
});

describe("ling-3.0-flash-vl capability enforcement", () => {
    it("keeps 10 reference videos eligible and rejects 11", () => {
        const definition = TEXT_SERVICES[MODEL];

        expect(textCapabilityError(definition, withVideos(10))).toBeUndefined();
        expect(textCapabilityError(definition, withVideos(11))).toMatch(
            /at most 10 reference videos/,
        );
        expect(supportsTextFallbackRequest(definition, withVideos(10))).toBe(
            true,
        );
        expect(supportsTextFallbackRequest(definition, withVideos(11))).toBe(
            false,
        );
    });

    it("rejects video input on a model that declares no video modality", () => {
        const definition = TEXT_SERVICES["tencent/hy3"];

        expect(definition.inputModalities).toEqual(["text"]);
        expect(textCapabilityError(definition, withVideos(1))).toBe(
            "This model does not support video input",
        );
    });

    it("leaves text and image requests on the model eligible", () => {
        const definition = TEXT_SERVICES[MODEL];
        const textRequest = {
            messages: [{ role: "user", content: "Describe this scene" }],
        };
        const imageRequest = {
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is this?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://example.com/frame.jpg",
                            },
                        },
                    ],
                },
            ],
        };

        expect(textCapabilityError(definition, textRequest)).toBeUndefined();
        expect(supportsTextFallbackRequest(definition, textRequest)).toBe(true);
        expect(textCapabilityError(definition, imageRequest)).toBeUndefined();
        expect(supportsTextFallbackRequest(definition, imageRequest)).toBe(
            true,
        );
    });
});

describe("Chat video parts over the Responses adapter", () => {
    it("normalizes video_url into an input_video item", () => {
        const request = chatToResponsesRequest(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this clip" },
                        {
                            type: "video_url",
                            video_url: {
                                url: "https://example.com/clip.mp4",
                                mime_type: "video/mp4",
                            },
                        },
                    ],
                },
            ],
            { model: "provider-model" },
        );

        expect(request.input).toMatchObject([
            {
                role: "user",
                content: [
                    { type: "input_text", text: "Describe this clip" },
                    {
                        type: "input_video",
                        video_url: "https://example.com/clip.mp4",
                        mime_type: "video/mp4",
                    },
                ],
            },
        ]);
    });
});
