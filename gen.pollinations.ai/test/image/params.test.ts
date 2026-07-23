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

    it("accepts MAI Image dimensions within the provider pixel limits", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "mai-image-2.5-flash",
                width: 1360,
                height: 768,
            }).success,
        ).toBe(true);
    });

    it("rejects MAI Image dimensions that are not multiples of 16", () => {
        const result = ImageParamsSchema.safeParse({
            model: "mai-image-2.5-flash",
            width: 1365,
            height: 768,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["width"],
                message: "MAI Image dimensions must be multiples of 16 pixels.",
            });
        }
    });

    it("rejects MAI Image dimensions below 768 pixels", () => {
        const result = ImageParamsSchema.safeParse({
            model: "mai-image-2.5-flash",
            width: 512,
            height: 1024,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["width"],
                message:
                    "MAI Image dimensions must each be at least 768 pixels.",
            });
        }
    });

    it("rejects MAI Image dimensions above the total pixel limit", () => {
        const result = ImageParamsSchema.safeParse({
            model: "mai-image-2.5-flash",
            width: 1040,
            height: 1024,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["width"],
                message:
                    "MAI Image width multiplied by height must not exceed 1,048,576 pixels.",
            });
        }
    });
});
