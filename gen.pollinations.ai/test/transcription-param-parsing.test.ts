import { describe, expect, it } from "vitest";
import { parsePositiveInt } from "../src/routes/audio.ts";

describe("parsePositiveInt", () => {
    it("returns undefined for null/empty input", () => {
        expect(parsePositiveInt(null, "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("", "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("   ", "speakers_expected")).toBeUndefined();
    });

    it("accepts positive integers", () => {
        expect(parsePositiveInt("1", "speakers_expected")).toBe(1);
        expect(parsePositiveInt("32", "speakers_expected")).toBe(32);
    });

    it("rejects non-integers, zero, negatives", () => {
        for (const v of ["0", "-1", "1.5", "abc", "NaN"]) {
            expect(() => parsePositiveInt(v, "speakers_expected")).toThrowError(
                /speakers_expected must be a positive integer/,
            );
        }
    });
});
