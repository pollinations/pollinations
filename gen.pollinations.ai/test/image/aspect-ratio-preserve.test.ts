import { describe, expect, it } from "vitest";

describe("snapDim", () => {
    const DIM_SNAP = 16;
    const PROVIDER_MAX_DIM = 4096;
    function snapDim(v: number): number {
        return Math.max(
            DIM_SNAP,
            Math.min(PROVIDER_MAX_DIM, Math.round(v / DIM_SNAP) * DIM_SNAP),
        );
    }

    it("snaps 1080 to 1088 (nearest 16x multiple)", () => {
        expect(snapDim(1080)).toBe(1088);
    });

    it("clamps to provider max 4096", () => {
        expect(snapDim(5000)).toBe(4096);
    });

    it("enforces minimum of 16", () => {
        expect(snapDim(1)).toBe(16);
    });

    it("handles exact multiples", () => {
        expect(snapDim(1024)).toBe(1024);
        expect(snapDim(1920)).toBe(1920);
    });
});

describe("resolveParams with detected size", () => {
    const QUALITY_MAP: Record<string, string> = {
        standard: "medium",
        hd: "high",
    };
    function resolveParams(opts: {
        size?: string;
        quality?: string;
        seed?: number;
    }) {
        const sizeDims = opts.size
            ? opts.size.split("x").map((s) => Number.parseInt(s, 10))
            : undefined;
        const width = sizeDims?.[0];
        const height = sizeDims?.[1];
        return {
            ...(Number.isInteger(width) ? { width } : {}),
            ...(Number.isInteger(height) ? { height } : {}),
            quality:
                QUALITY_MAP[opts.quality || ""] || opts.quality || "medium",
            seed: opts.seed ?? 42,
        };
    }

    it("returns no width/height when size is undefined", () => {
        const r = resolveParams({ size: undefined });
        expect(r.width).toBeUndefined();
        expect(r.height).toBeUndefined();
    });

    it("parses detected size string", () => {
        const r = resolveParams({ size: "768x1024" });
        expect(r.width).toBe(768);
        expect(r.height).toBe(1024);
    });
});
