import { describe, expect, it } from "vitest";
import { computeAspectRatioSize } from "../../src/routes/images.ts";

function parse(size: string): { width: number; height: number } {
    const [width, height] = size.split("x").map(Number);
    return { width, height };
}

describe("computeAspectRatioSize", () => {
    it("keeps a landscape source under the pixel budget close to its ratio", () => {
        const { width, height } = parse(computeAspectRatioSize(1920, 1080));
        expect(width).toBeGreaterThan(height);
        expect(width * height).toBeLessThanOrEqual(1_048_576);
        expect(width / height).toBeCloseTo(1920 / 1080, 1);
    });

    it("keeps a portrait source portrait", () => {
        const { width, height } = parse(computeAspectRatioSize(1080, 1920));
        expect(height).toBeGreaterThan(width);
        expect(width / height).toBeCloseTo(1080 / 1920, 1);
    });

    it("does not upscale a source already under the pixel budget", () => {
        expect(computeAspectRatioSize(512, 384)).toBe("512x384");
    });

    it("snaps every dimension to a multiple of 16", () => {
        const { width, height } = parse(computeAspectRatioSize(1000, 700));
        expect(width % 16).toBe(0);
        expect(height % 16).toBe(0);
    });

    it("never snaps a dimension below 16", () => {
        const { width, height } = parse(computeAspectRatioSize(4000, 8));
        expect(width).toBeGreaterThanOrEqual(16);
        expect(height).toBeGreaterThanOrEqual(16);
    });

    it("treats a square source as square", () => {
        expect(computeAspectRatioSize(2000, 2000)).toBe("1024x1024");
    });
});
