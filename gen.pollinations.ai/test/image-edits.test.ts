import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../src/image/params.ts";
import {
    getImageDimensions,
    getImageDimensionsFromUrl,
} from "../src/image/utils/imageDownload.ts";

describe("Image Edit Size Inference", () => {
    it("preserves landscape aspect ratio when size is omitted", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            source_width: 1920,
            source_height: 1080,
        });

        expect(result.width).toBe(1360);
        expect(result.height).toBe(768);
        expect(result.dimensionsExplicit).toBe(false);
    });

    it("preserves portrait aspect ratio when size is omitted", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            source_width: 1080,
            source_height: 1920,
        });
        expect(result.width).toBe(768);
        expect(result.height).toBe(1360);
        expect(result.dimensionsExplicit).toBe(false);
    });

    it("uses explicit size when provided, bypassing proportional inference", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            width: 512,
            height: 512,
            source_width: 1920,
            source_height: 1080,
        });
        expect(result.width).toBe(512);
        expect(result.height).toBe(512);
        expect(result.dimensionsExplicit).toBe(true);
    });

    it("extracts dimensions directly from PNG buffer headers", () => {
        const pngHeader = new Uint8Array(24);
        pngHeader[0] = 0x89;
        pngHeader[1] = 0x50;
        pngHeader[2] = 0x4e;
        pngHeader[3] = 0x47;
        const view = new DataView(pngHeader.buffer);
        view.setUint32(16, 1920, false);
        view.setUint32(20, 1080, false);

        const dims = getImageDimensions(pngHeader);
        expect(dims).toEqual({ width: 1920, height: 1080 });
    });

    it("extracts dimensions from a data URI image URL end-to-end", async () => {
        const pngHeader = new Uint8Array(24);
        pngHeader[0] = 0x89;
        pngHeader[1] = 0x50;
        pngHeader[2] = 0x4e;
        pngHeader[3] = 0x47;
        const view = new DataView(pngHeader.buffer);
        view.setUint32(16, 1920, false);
        view.setUint32(20, 1080, false);

        const base64 = Buffer.from(pngHeader).toString("base64");
        const dataUri = `data:image/png;base64,${base64}`;

        const dims = await getImageDimensionsFromUrl(dataUri);
        expect(dims).toEqual({ width: 1920, height: 1080 });
    });
});
