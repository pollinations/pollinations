import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";

describe("ImageParamsSchema", () => {
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

describe("ImageParamsSchema dimensionsExplicit", () => {
    it("defaults to false when no dimensions are given", () => {
        const result = ImageParamsSchema.parse({ model: "flux" });
        expect(result.dimensionsExplicit).toBe(false);
    });

    it("defaults to true when width/height are given", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            width: 800,
            height: 600,
        });
        expect(result.dimensionsExplicit).toBe(true);
    });

    // #12583: /v1/images/edits sets width/height from the source image's
    // own aspect ratio when the caller omits `size`. That's not an explicit
    // request for those dimensions, so the route overrides the signal —
    // this is what keeps seedream-4's custom-vs-preset routing correct.
    it("can be overridden to false even when width/height are given", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            width: 800,
            height: 600,
            dimensionsExplicit: false,
        });
        expect(result.dimensionsExplicit).toBe(false);
    });

    it("can be overridden to true even without width/height", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            dimensionsExplicit: true,
        });
        expect(result.dimensionsExplicit).toBe(true);
    });

    it("accepts the override as a query-string boolean", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            width: 800,
            height: 600,
            dimensionsExplicit: "false",
        });
        expect(result.dimensionsExplicit).toBe(false);
    });
});
