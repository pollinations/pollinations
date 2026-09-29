/**
 * Tests for the seed parameter clamping fix (issue #15464).
 *
 * Problem: Passing `Date.now()` (13-digit ms timestamp) as `?seed` caused a
 * 400 "Too big: expected number to be <=2147483647" error because the Zod
 * schema applied a hard `.max()` check with no prior normalization.
 *
 * Fix: A `clampSeed()` helper reduces any integer to [0, INT32_MAX] via
 * modulo before validation. It is called inside a `.preprocess()` step.
 */

import { describe, expect, it } from "vitest";
import { clampSeed } from "../../src/schemas/image.ts";

const INT32_MAX = 2147483647; // 2^31 - 1

describe("clampSeed", () => {
    it("passes small valid seeds through unchanged", () => {
        expect(clampSeed(0)).toBe(0);
        expect(clampSeed(42)).toBe(42);
        expect(clampSeed(1000)).toBe(1000);
        expect(clampSeed(INT32_MAX)).toBe(INT32_MAX);
    });

    it("preserves -1 for random seed", () => {
        expect(clampSeed(-1)).toBe(-1);
    });

    it("clamps a Date.now()-style 13-digit timestamp into the valid range", () => {
        // Representative Date.now() value (~2026)
        const dateNowSeed = 1790360632000;
        const clamped = clampSeed(dateNowSeed);
        expect(clamped).toBeGreaterThanOrEqual(0);
        expect(clamped).toBeLessThanOrEqual(INT32_MAX);
    });

    it("always returns a value within [0, INT32_MAX] for any non-negative input", () => {
        const inputs = [
            0,
            1,
            INT32_MAX,
            INT32_MAX + 1,
            9_999_999_999_999, // another 13-digit value
            Number.MAX_SAFE_INTEGER,
            Date.now(),
        ];
        for (const v of inputs) {
            const result = clampSeed(v);
            expect(result, `clampSeed(${v})`).toBeGreaterThanOrEqual(0);
            expect(result, `clampSeed(${v})`).toBeLessThanOrEqual(INT32_MAX);
        }
    });

    it("is deterministic — same input always yields the same output", () => {
        const seed = 1790360632000;
        expect(clampSeed(seed)).toBe(clampSeed(seed));
    });

    it("rounds floating-point values before clamping", () => {
        expect(clampSeed(42.9)).toBe(43);
        expect(clampSeed(42.1)).toBe(42);
    });

    it("handles INT32_MAX + 1 by wrapping to 0", () => {
        expect(clampSeed(INT32_MAX + 1)).toBe(0);
    });

    it("handles INT32_MAX + 2 by wrapping to 1", () => {
        expect(clampSeed(INT32_MAX + 2)).toBe(1);
    });
});
