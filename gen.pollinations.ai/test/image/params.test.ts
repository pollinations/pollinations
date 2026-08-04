import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";

describe("ImageParamsSchema", () => {
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
