import { CreateImageRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";
import { SENTINEL_SEED } from "../../src/util.ts";

describe("ImageParamsSchema", () => {
    it("normalizes seed -1 to the sentinel seed", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            seed: -1,
        });

        expect(result.seed).toBe(SENTINEL_SEED);
    });

    it("rejects transparent backgrounds for gpt-image-2", () => {
        const result = ImageParamsSchema.safeParse({
            model: "gpt-image-2",
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
                model: "gptimage",
                transparent: true,
            }).success,
        ).toBe(true);
    });

    it("accepts resolutions declared by the model", () => {
        expect(
            ImageParamsSchema.safeParse({ model: "veo", resolution: "1080p" })
                .success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "seedance-pro",
                resolution: "480p",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "grok-imagine-image-2.0",
                resolution: "2k",
                quality: "low",
            }).success,
        ).toBe(true);
        for (const resolution of ["480p", "768p", "2k"] as const) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "minimax-h3",
                    resolution,
                }).success,
            ).toBe(true);
        }
    });

    it("accepts 768p on the OpenAI-compatible image route", () => {
        expect(
            CreateImageRequestSchema.safeParse({
                model: "minimax-h3",
                prompt: "a red wind-up robot",
                resolution: "768p",
            }).success,
        ).toBe(true);
    });

    it("enforces the public minimax-h3 contract", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax-h3",
                duration: 6,
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax-h3",
                aspectRatio: "9:16",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax-h3",
                fps: 30,
            }).success,
        ).toBe(false);
    });

    it("rejects unsupported Grok Imagine Image 2.0 quality", () => {
        const result = ImageParamsSchema.safeParse({
            model: "grok-imagine-image-2.0",
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
                model: "grok-imagine-image-2.0",
                quality: "LOW",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.parse({ model: "flux", quality: "LOW" }).quality,
        ).toBe("medium");
    });

    it("rejects an unsupported resolution", () => {
        const result = ImageParamsSchema.safeParse({
            model: "veo",
            resolution: "480p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    'Resolution "480p" is not supported by veo. Supported: 720p, 1080p.',
            });
        }
    });

    it("rejects resolution on models without resolution tiers", () => {
        const result = ImageParamsSchema.safeParse({
            model: "flux",
            resolution: "720p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message: "flux does not accept a resolution parameter.",
            });
        }
    });
});

    it("accepts input_references for Seedance 2.5", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: [
                "https://media.pollinations.ai/ref1",
                "https://example.com/ref2.png",
                "https://example.com/ref3.jpg",
            ],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.input_references).toHaveLength(3);
        }
    });

    it("accepts input_reference_videos for Seedance 2.5", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_reference_videos: [
                "https://media.pollinations.ai/video1",
                "https://example.com/video2.mp4",
            ],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.input_reference_videos).toHaveLength(2);
        }
    });

    it("accepts input_reference_audios for Seedance 2.5", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_reference_audios: [
                "https://media.pollinations.ai/audio1",
                "https://example.com/audio2.mp3",
            ],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.input_reference_audios).toHaveLength(2);
        }
    });

    it("accepts input_references for Seedance 2.0", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.0",
            input_references: ["https://media.pollinations.ai/ref1"],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.input_references).toHaveLength(1);
        }
    });

    it("rejects input_references on unsupported models", () => {
        const result = ImageParamsSchema.safeParse({
            model: "veo",
            input_references: "https://media.pollinations.ai/ref1",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references"],
                message: "veo does not support input_references.",
            });
        }
    });

    it("rejects input_reference_videos on models without that capability", () => {
        const result = ImageParamsSchema.safeParse({
            model: "veo",
            input_reference_videos: ["https://example.com/ref.mp4"],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_reference_videos"],
                message: "veo does not support input_reference_videos.",
            });
        }
    });

    it("rejects non-public reference URLs", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: "http://127.0.0.1/ref.png",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references", 0],
                message:
                    "Reference URLs must use public HTTP(S) URLs without credentials or literal IP hosts.",
            });
        }
    });

    it("rejects combining input_references with frame images", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            image: "https://example.com/frame.png",
            input_references: "https://media.pollinations.ai/ref1",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references"],
                message:
                    "seedance-2.5 cannot combine input_references with first/last-frame images.",
            });
        }
    });

    it("normalizes pipe-separated input references", () => {
        const result = ImageParamsSchema.parse({
            model: "seedance-2.5",
            input_references:
                "https://media.pollinations.ai/first||https://example.com/second|",
        });
        expect(result.input_references).toEqual([
            "https://media.pollinations.ai/first",
            "https://example.com/second",
        ]);
    });
