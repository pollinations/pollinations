import { describe, expect, it } from "vitest";
import { parsePositiveInt, parseStrictBoolean } from "../src/routes/audio.ts";

describe("parseStrictBoolean", () => {
    it("accepts truthy variants", () => {
        for (const v of ["true", "1", "yes", "on", "TRUE", "  YES  "]) {
            expect(parseStrictBoolean(v, "speaker_labels")).toBe(true);
        }
    });

    it("accepts falsy variants", () => {
        for (const v of ["false", "0", "no", "off", "", "FALSE", "  No  "]) {
            expect(parseStrictBoolean(v, "speaker_labels")).toBe(false);
        }
    });

    it("returns false on null", () => {
        expect(parseStrictBoolean(null, "speaker_labels")).toBe(false);
    });

    it("throws on unknown values rather than silently flipping to false", () => {
        expect(() =>
            parseStrictBoolean("maybe", "speaker_labels"),
        ).toThrowError(/speaker_labels must be a boolean/);
    });
});

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
