import { CreateImageRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";
import { SENTINEL_SEED } from "../../src/util.ts";

describe("ImageParamsSchema", () => {
    it("normalizes seed -1 to the sentinel seed", () => {
        const result = ImageParamsSchema.parse({
            model: "black-forest-labs/FLUX.1-schnell",
            seed: -1,
        });

        expect(result.seed).toBe(SENTINEL_SEED);
    });

    it("rejects transparent backgrounds for gpt-image-2", () => {
        const result = ImageParamsSchema.safeParse({
            model: "openai/gpt-image-2",
            transparent: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["transparent"],
                message:
                    "Transparent backgrounds are not supported by gpt-image-2.",
            });
        }
    });

    it("keeps transparent backgrounds available for gptimage models", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "openai/gpt-image-1-mini",
                transparent: true,
            }).success,
        ).toBe(true);
    });

    it("accepts resolutions declared by the model", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "google/veo-3.1-fast",
                resolution: "1080p",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "bytedance/seedance-1-pro-fast",
                resolution: "480p",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "x-ai/grok-imagine-image-2.0",
                resolution: "2k",
                quality: "low",
            }).success,
        ).toBe(true);
        for (const resolution of ["480p", "768p", "2k"] as const) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "minimax/minimax-h3",
                    resolution,
                }).success,
            ).toBe(true);
        }
    });

    it("accepts 768p on the OpenAI-compatible image route", () => {
        expect(
            CreateImageRequestSchema.safeParse({
                model: "minimax/minimax-h3",
                prompt: "a red wind-up robot",
                resolution: "768p",
            }).success,
        ).toBe(true);
    });

    it("enforces the public minimax-h3 contract", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                duration: 6,
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                aspectRatio: "9:16",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                fps: 30,
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                image: "https://example.com/frame.png",
            }).success,
        ).toBe(false);
    });

    it("rejects unsupported Grok Imagine Image 2.0 quality", () => {
        const result = ImageParamsSchema.safeParse({
            model: "x-ai/grok-imagine-image-2.0",
            quality: "high",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["quality"],
                message:
                    "grok-imagine-image-2.0 supports low or medium quality.",
            });
        }
    });

    it("does not silently upgrade invalid Grok Imagine Image 2.0 quality", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "x-ai/grok-imagine-image-2.0",
                quality: "LOW",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.parse({
                model: "black-forest-labs/FLUX.1-schnell",
                quality: "LOW",
            }).quality,
        ).toBe("medium");
    });

    it("rejects an unsupported resolution", () => {
        const result = ImageParamsSchema.safeParse({
            model: "google/veo-3.1-fast",
            resolution: "480p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    'Resolution "480p" is not supported by google/veo-3.1-fast. Supported: 720p, 1080p.',
            });
        }
    });

    it("rejects resolution on models without resolution tiers", () => {
        const result = ImageParamsSchema.safeParse({
            model: "black-forest-labs/FLUX.1-schnell",
            resolution: "720p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    "black-forest-labs/FLUX.1-schnell does not accept a resolution parameter.",
            });
        }
    });
});
