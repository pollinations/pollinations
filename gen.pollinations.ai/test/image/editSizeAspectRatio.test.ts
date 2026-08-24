import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { resolveEditDimensionsForImage } from "../../src/image/handler.ts";
import type { ImageParams } from "../../src/image/params.ts";

function pngDataUri(width: number, height: number): string {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function makeParams(overrides: Partial<ImageParams> = {}): ImageParams {
    return {
        model: "gpt-image-2",
        width: 1024,
        height: 1024,
        dimensionsExplicit: false,
        seed: 42,
        safe: false,
        quality: "medium",
        image: [],
        transparent: false,
        reasoning: "balanced",
        audio: false,
        ...overrides,
    };
}

describe("image edit dimensions", () => {
    it("does not default an omitted JSON edit size to square", () => {
        const edit = CreateImageEditRequestSchema.parse({
            prompt: "add flowers",
            image: "https://example.com/source.png",
        });
        const generation = CreateImageRequestSchema.parse({
            prompt: "flowers",
        });
        const explicit = CreateImageEditRequestSchema.parse({
            prompt: "add flowers",
            image: "https://example.com/source.png",
            size: "512x1024",
        });

        expect(edit.size).toBeUndefined();
        expect(generation.size).toBe("1024x1024");
        expect(explicit.size).toBe("512x1024");
    });

    it.each([
        [800, 1200, 688, 1024],
        [1536, 1024, 1024, 688],
        [4032, 3024, 1024, 768],
        [100, 10_000, 256, 1024],
    ])("fits a %ix%i source into safe defaults as %ix%i", async (sourceWidth, sourceHeight, width, height) => {
        const resolved = await resolveEditDimensionsForImage(
            makeParams({
                image: [pngDataUri(sourceWidth, sourceHeight)],
            }),
        );

        expect(resolved).toMatchObject({ width, height });
        expect(resolved.dimensionsExplicit).toBe(false);
    });

    it("leaves an explicit size unchanged", async () => {
        const params = makeParams({
            image: [pngDataUri(800, 1200)],
            width: 512,
            height: 1024,
            dimensionsExplicit: true,
        });

        expect(await resolveEditDimensionsForImage(params)).toBe(params);
    });

    it("keeps model defaults when source dimensions are unreadable", async () => {
        const params = makeParams({
            image: ["data:image/png;base64,AQID"],
        });

        expect(await resolveEditDimensionsForImage(params)).toBe(params);
    });
});
