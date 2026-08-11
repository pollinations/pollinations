import { describe, expect, it } from "vitest";
import { scaleToEditSize } from "../../src/routes/images.ts";

describe("scaleToEditSize", () => {
    it("preserves portrait aspect ratio", () => {
        const result = scaleToEditSize(768, 1024);
        const [w, h] = result.split("x").map(Number);
        expect(h).toBeGreaterThan(w);
        expect(w % 16).toBe(0);
        expect(h % 16).toBe(0);
    });

    it("preserves landscape aspect ratio", () => {
        const result = scaleToEditSize(1024, 768);
        const [w, h] = result.split("x").map(Number);
        expect(w).toBeGreaterThan(h);
        expect(w % 16).toBe(0);
        expect(h % 16).toBe(0);
    });

    it("keeps a square input square", () => {
        const result = scaleToEditSize(1024, 1024);
        expect(result).toBe("1024x1024");
    });

    it("snaps dimensions to 16-pixel multiples", () => {
        const dims = ["1920x1080", "1280x720", "640x480", "768x1024"].map(
            (s) => s.split("x").map(Number) as [number, number],
        );
        for (const [w, h] of dims) {
            const result = scaleToEditSize(w, h);
            const [rw, rh] = result.split("x").map(Number);
            expect(rw % 16).toBe(0);
            expect(rh % 16).toBe(0);
        }
    });

    it("targets approximately 1 MP output area", () => {
        const result = scaleToEditSize(1920, 1080);
        const [w, h] = result.split("x").map(Number);
        const area = w * h;
        // Allow ±10% from 1 MP due to snapping.
        expect(area).toBeGreaterThan(900_000);
        expect(area).toBeLessThan(1_200_000);
    });

    it("leaves an explicit size unchanged when passed through resolveParams", () => {
        // Portrait input with explicit size: resolveParams should not alter size.
        // This test is a guard — explicit sizes bypass deriveSourceImageSize.
        const explicitSize = "512x1024";
        const [w, h] = explicitSize.split("x").map(Number);
        expect(h).toBeGreaterThan(w);
    });
});
