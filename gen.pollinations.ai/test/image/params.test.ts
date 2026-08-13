import { Buffer } from "node:buffer";
import { CreateImageEditRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import {
    deriveDimensionsFromInputImage,
    ImageParamsSchema,
} from "../../src/image/params.ts";

/** Minimal PNG: signature + IHDR header carrying real width/height. */
function pngDataUri(width: number, height: number): string {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

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

describe("deriveDimensionsFromInputImage", () => {
    it("keeps a small source's exact dimensions when size is omitted", async () => {
        const params = ImageParamsSchema.parse({
            model: "flux",
            image: [pngDataUri(512, 768)],
        });
        expect(params.dimensionsExplicit).toBe(false);

        const derived = await deriveDimensionsFromInputImage(params);

        expect(derived).toMatchObject({ width: 512, height: 768 });
        expect(derived.dimensionsExplicit).toBe(false);
    });

    it("scales a large landscape source into the model's pixel budget", async () => {
        const params = ImageParamsSchema.parse({
            model: "flux",
            image: [pngDataUri(4096, 2048)],
        });

        const derived = await deriveDimensionsFromInputImage(params);

        // 2:1 ratio preserved, area ≈ 1024² instead of the raw 4096x2048.
        expect(derived.width / derived.height).toBeCloseTo(2, 1);
        expect(derived.width * derived.height).toBeLessThanOrEqual(
            1024 * 1024 * 1.01,
        );
        expect(derived.width).toBeGreaterThan(derived.height);
    });

    it("uses the model's own default budget, not the global one", async () => {
        const params = ImageParamsSchema.parse({
            model: "seedream5",
            image: [pngDataUri(8192, 4096)],
        });

        const derived = await deriveDimensionsFromInputImage(params);

        // seedream5 defaults to a 2048 square, so the budget is 2048².
        expect(derived.width / derived.height).toBeCloseTo(2, 1);
        expect(derived.width * derived.height).toBeGreaterThan(1024 * 1024);
        expect(derived.width * derived.height).toBeLessThanOrEqual(
            2048 * 2048 * 1.01,
        );
    });

    it("leaves explicitly requested dimensions untouched", async () => {
        const params = ImageParamsSchema.parse({
            model: "flux",
            width: 640,
            height: 640,
            image: [pngDataUri(512, 768)],
        });
        expect(params.dimensionsExplicit).toBe(true);

        const derived = await deriveDimensionsFromInputImage(params);

        expect(derived).toBe(params);
    });

    it("falls back to the square default when the image is unreadable", async () => {
        const params = ImageParamsSchema.parse({
            model: "flux",
            image: ["data:image/png;base64,AAAA"],
        });

        const derived = await deriveDimensionsFromInputImage(params);

        expect(derived).toMatchObject({ width: 1024, height: 1024 });
    });

    it("does nothing without an input image", async () => {
        const params = ImageParamsSchema.parse({ model: "flux" });

        const derived = await deriveDimensionsFromInputImage(params);

        expect(derived).toBe(params);
    });
});

describe("CreateImageEditRequestSchema size default", () => {
    it("leaves size undefined when the caller omits it", () => {
        const parsed = CreateImageEditRequestSchema.parse({
            prompt: "make it blue",
            image: "https://example.com/source.png",
        });
        expect(parsed.size).toBeUndefined();
    });

    it("keeps an explicit size", () => {
        const parsed = CreateImageEditRequestSchema.parse({
            prompt: "make it blue",
            image: [{ image_url: "https://example.com/source.png" }],
            size: "1536x1024",
        });
        expect(parsed.size).toBe("1536x1024");
    });
});
