import { describe, expect, it } from "vitest";
import { normalizeSeed } from "../../src/util.ts";

describe("speech seed sentinel", () => {
    it("maps the documented -1 random sentinel to SENTINEL_SEED", () => {
        expect(normalizeSeed(-1)).toBe(42);
    });

    it("passes an ordinary seed through unchanged", () => {
        expect(normalizeSeed(0)).toBe(0);
        expect(normalizeSeed(12345)).toBe(12345);
        expect(normalizeSeed(undefined)).toBeUndefined();
    });
});
