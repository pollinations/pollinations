import { describe, expect, it } from "vitest";
import { isSvgFile } from "../frontend/src/components/community-endpoints/icon-upload.ts";

const svgWith = (name: string, type: string) =>
    new File(["<svg/>"], name, { type });

describe("icon upload SVG check", () => {
    it("accepts an SVG by MIME type or extension", () => {
        expect(isSvgFile(svgWith("icon.svg", "image/svg+xml"))).toBe(true);
        // Empty type (e.g. renamed file) still accepted by extension.
        expect(isSvgFile(svgWith("icon.SVG", ""))).toBe(true);
    });

    it("rejects non-SVG files", () => {
        expect(isSvgFile(svgWith("icon.png", "image/png"))).toBe(false);
        expect(
            isSvgFile(svgWith("icon.svg.exe", "application/octet-stream")),
        ).toBe(false);
    });
});
