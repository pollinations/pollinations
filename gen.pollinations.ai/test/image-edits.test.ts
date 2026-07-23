import { describe, it, expect } from "vitest";
import { ImageParamsSchema } from "../src/image/params.ts";

describe("Image Edit Size Inference", () => {
    it("preserves landscape aspect ratio when size is omitted", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
            source_width: 1920,
            source_height: 1080,
        });
        
        // For standard models (e.g. 1024 base default), scales 1920x1080 
        // proportionately to match 1,048,576 pixel bounds.
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
        // Source dimensions ignored completely
        expect(result.width).toBe(512);
        expect(result.height).toBe(512);
        expect(result.dimensionsExplicit).toBe(true);
    });

    it("falls back to square if no source dimensions or explicit size exist", () => {
        const result = ImageParamsSchema.parse({
            model: "flux",
        });
        // flux defaults to 1024
        expect(result.width).toBe(1024);
        expect(result.height).toBe(1024);
        expect(result.dimensionsExplicit).toBe(false);
    });
});