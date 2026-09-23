import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import {
    CompletionUsageSchema,
    CreateChatCompletionRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../../src/text/availableModels.ts";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../../src/text/fallbackCompatibility.ts";
import { chatToResponsesRequest } from "../../src/text/responses/chatRequest.ts";

const LING = "inclusionai/ling-3.0-flash-vl";
// Declares text input only, so it must never carry a video part.
const TEXT_ONLY = "tencent/hy3";

const videoPart = (url: string) => ({
    type: "video_url" as const,
    video_url: { url },
});

const videoRequest = (videos: number) => ({
    model: LING,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "What happens in these clips?" },
                ...Array.from({ length: videos }, (_, index) =>
                    videoPart(`https://example.com/clip-${index}.mp4`),
                ),
            ],
        },
    ],
});

describe("inclusionai/ling-3.0-flash-vl video input", () => {
    it("parses video_url parts next to text and image parts", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: LING,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What happens in this clip?" },
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/frame.png" },
                        },
                        videoPart("https://example.com/clip.mp4"),
                    ],
                },
            ],
        });

        const content = parsed.messages[0].content as Array<{ type: string }>;
        expect(content.map((part) => part.type)).toEqual([
            "text",
            "image_url",
            "video_url",
        ]);
    });

    it("parses a base64 data URI the pinned route accepts", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: LING,
            messages: [
                {
                    role: "user",
                    content: [
                        videoPart("data:video/mp4;base64,AAAAIGZ0eXBpc29t"),
                    ],
                },
            ],
        });

        const content = parsed.messages[0].content as Array<{
            video_url?: { url?: string };
        }>;
        expect(content[0].video_url?.url).toContain("data:video/mp4;base64,");
    });

    it("registers text, image and video input with a video rate and caps", () => {
        const definition = getRegistryModelDefinition(LING);

        expect(definition.inputModalities).toEqual(["text", "image", "video"]);
        expect(definition.cost.promptVideoTokens).toBeGreaterThan(0);
        // The registry declares these caps; the request path must enforce them.
        expect(definition.maxReferenceVideos).toBe(10);
        expect(definition.maxCompletionTokens).toBe(32768);
    });

    it("keeps the route pinned to deepinfra/fp16 without fallback", () => {
        expect(findModelByName(LING)?.config()?.defaultOptions).toMatchObject({
            provider: { only: ["deepinfra/fp16"], allow_fallbacks: false },
        });
    });
});

describe("video parts in the text capability gate", () => {
    it("accepts a video request on a model that declares video input", () => {
        expect(
            textCapabilityError(
                getRegistryModelDefinition(LING),
                videoRequest(1),
            ),
        ).toBeUndefined();
    });

    it("rejects a video part on a model that declares only text input", () => {
        expect(
            textCapabilityError(
                getRegistryModelDefinition(TEXT_ONLY),
                videoRequest(1),
            ),
        ).toBe("This model does not support video input");
    });

    it("enforces the declared reference-video cap", () => {
        const definition = getRegistryModelDefinition(LING);

        expect(
            textCapabilityError(definition, videoRequest(10)),
        ).toBeUndefined();
        expect(textCapabilityError(definition, videoRequest(11))).toBe(
            "This model supports at most 10 reference videos",
        );
    });

    it("counts video parts nested inside Responses input items", () => {
        expect(
            textCapabilityError(getRegistryModelDefinition(LING), {
                model: LING,
                input: [
                    {
                        role: "user",
                        content: Array.from({ length: 11 }, (_, index) =>
                            videoPart(`https://example.com/clip-${index}.mp4`),
                        ),
                    },
                ],
            }),
        ).toBe("This model supports at most 10 reference videos");
    });

    it("leaves a text request on a text-only model untouched", () => {
        expect(
            textCapabilityError(getRegistryModelDefinition(TEXT_ONLY), {
                model: TEXT_ONLY,
                messages: [{ role: "user", content: "hello" }],
            }),
        ).toBeUndefined();
    });

    it("keeps a video request away from a fallback route that cannot take it", () => {
        expect(
            supportsTextFallbackRequest(
                getRegistryModelDefinition(TEXT_ONLY),
                videoRequest(1),
            ),
        ).toBe(false);
        expect(
            supportsTextFallbackRequest(
                getRegistryModelDefinition(LING),
                videoRequest(1),
            ),
        ).toBe(true);
    });
});

describe("video parts through the stateless Responses adapter", () => {
    const asChatMessages = (content: unknown[]) =>
        [{ role: "user", content }] as unknown as Parameters<
            typeof chatToResponsesRequest
        >[0];

    const inputContent = (request: ReturnType<typeof chatToResponsesRequest>) =>
        (request.input[0] as { content: Array<Record<string, unknown>> })
            .content;

    it("normalizes a Chat video_url part into an input_video item", () => {
        const request = chatToResponsesRequest(
            asChatMessages([
                { type: "text", text: "What happens in this clip?" },
                videoPart("https://example.com/clip.mp4"),
            ]),
            { model: LING },
        );

        expect(inputContent(request)).toContainEqual(
            expect.objectContaining({
                type: "input_video",
                video_url: "https://example.com/clip.mp4",
            }),
        );
    });

    it("carries an optional mime_type onto the normalized part", () => {
        const request = chatToResponsesRequest(
            asChatMessages([
                {
                    type: "video_url",
                    video_url: {
                        url: "https://example.com/clip.mp4",
                        mime_type: "video/mp4",
                    },
                },
            ]),
            { model: LING },
        );

        expect(inputContent(request)).toContainEqual(
            expect.objectContaining({ mime_type: "video/mp4" }),
        );
    });

    it("refuses a video part that carries no URL", () => {
        expect(() =>
            chatToResponsesRequest(
                asChatMessages([{ type: "video_url", video_url: {} }]),
                { model: LING },
            ),
        ).toThrow(/video URL/);
    });
});

describe("video tokens survive usage validation", () => {
    it("keeps prompt_tokens_details.video_tokens instead of dropping it", () => {
        const parsed = CompletionUsageSchema.parse({
            prompt_tokens: 20,
            completion_tokens: 2,
            total_tokens: 22,
            prompt_tokens_details: {
                cached_tokens: 2,
                image_tokens: 0,
                video_tokens: 5,
            },
        });

        expect(parsed.prompt_tokens_details?.video_tokens).toBe(5);
    });

    it("routes those tokens into a bucket the model has a rate for", () => {
        const parsed = CompletionUsageSchema.parse({
            prompt_tokens: 20,
            completion_tokens: 2,
            total_tokens: 22,
            prompt_tokens_details: { cached_tokens: 2, video_tokens: 5 },
        });

        const usage = openaiUsageToUsage(parsed);

        // Video tokens leave the text bucket, so an unregistered video rate
        // would bill this line as 0 (registry.convertUsage).
        expect(usage.promptVideoTokens).toBe(5);
        expect(usage.promptTextTokens).toBe(13);
        expect(
            getRegistryModelDefinition(LING).cost.promptVideoTokens,
        ).toBeGreaterThan(0);
    });
});
