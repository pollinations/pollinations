import { CreateImageRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";
import { GenerateVideoRequestQueryParamsSchema } from "../../src/schemas/image.ts";
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

    it("normalizes Seedance 2.5 input references using only pipe separators", () => {
        expect(
            ImageParamsSchema.parse({
                model: "seedance-2.5",
                input_references:
                    "https://media.pollinations.ai/first||https://example.com/reference.png?crop=1,2|",
            }).input_references,
        ).toEqual([
            "https://media.pollinations.ai/first",
            "https://example.com/reference.png?crop=1,2",
        ]);
    });

    it("uses the same pipe-only contract on the public video query", () => {
        expect(
            GenerateVideoRequestQueryParamsSchema.parse({
                model: "seedance-2.5",
                input_references:
                    "https://media.pollinations.ai/first||https://example.com/reference.png?crop=1,2|",
            }).input_references,
        ).toEqual([
            "https://media.pollinations.ai/first",
            "https://example.com/reference.png?crop=1,2",
        ]);
    });

    it("accepts the advertised Seedance 2.5 reference limit", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: [
                "https://media.pollinations.ai/first",
                "https://example.com/second.png",
                "https://example.com/third.png",
            ],
        });

        expect(result.success).toBe(true);
    });

    it("rejects input references on unsupported models", () => {
        const result = ImageParamsSchema.safeParse({
            model: "flux",
            input_references: "https://media.pollinations.ai/first",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references"],
                message: "flux does not support input_references.",
            });
        }
    });

    it("rejects references above the registry-driven model limit", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: Array.from(
                { length: 4 },
                (_, index) => `https://example.com/${index}.png`,
            ),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references"],
                message: "seedance-2.5 supports at most 3 input references.",
            });
        }
    });

    it("bounds input-reference validation before checking the model limit", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: Array.from(
                { length: 100_000 },
                (_, index) => `https://example.com/${index}.png`,
            ),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toBe(
                "input_references accepts at most 30 URLs.",
            );
        }
    });

    it("rejects reference guidance combined with a real frame", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            image: "https://example.com/frame.png",
            input_references: "https://media.pollinations.ai/first",
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

    it("ignores empty image fragments in the reference conflict check", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            image: ",",
            input_references: "https://media.pollinations.ai/first",
        });

        expect(result.success).toBe(true);
    });

    it.each([
        "http://127.0.0.1/reference.png",
        "https://user:password@example.com/reference.png",
    ])("rejects non-public reference URL %s", (inputReference) => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.5",
            input_references: inputReference,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["input_references", 0],
                message:
                    "Reference images must use public HTTP(S) URLs without credentials or literal IP hosts.",
            });
        }
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
