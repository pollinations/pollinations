import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
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

    it("defaults video resolution from registry order", () => {
        const result = ImageParamsSchema.parse({ model: "veo" });
        expect(result.resolution).toBe("720p");
        expect(result.audio).toBe(false);
    });

    it("accepts a supported model resolution", () => {
        const result = ImageParamsSchema.parse({
            model: "seedance-pro",
            resolution: "1080p",
        });
        expect(result.resolution).toBe("1080p");
    });

    it("rejects a resolution not supported by the selected model", () => {
        const result = ImageParamsSchema.safeParse({
            model: "seedance-2.0",
            resolution: "1080p",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    'Resolution "1080p" is not supported by seedance-2.0. Supported: 720p, 480p.',
            });
        }
    });

    it("only accepts draft mode for p-video", () => {
        expect(
            ImageParamsSchema.safeParse({ model: "p-video", draft: true })
                .success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({ model: "veo", draft: true }).success,
        ).toBe(false);
    });
});

describe("OpenAI-compatible media parameters", () => {
    it("accepts resolution and draft for generation", () => {
        expect(
            CreateImageRequestSchema.parse({
                prompt: "preview",
                model: "p-video",
                resolution: "1080p",
                draft: true,
            }),
        ).toMatchObject({ resolution: "1080p", draft: true });
    });

    it("accepts resolution and draft for edits", () => {
        expect(
            CreateImageEditRequestSchema.parse({
                prompt: "animate this",
                image: "https://example.com/frame.png",
                model: "p-video",
                resolution: "720p",
                draft: true,
            }),
        ).toMatchObject({ resolution: "720p", draft: true });
    });
});
