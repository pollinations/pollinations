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

    it("accepts resolutions the model declares", () => {
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

    it("rejects a resolution the model does not declare", () => {
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

    it("rejects the resolution parameter on non-resolution models", () => {
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
