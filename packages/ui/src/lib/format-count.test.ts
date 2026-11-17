import { describe, expect, it } from "vitest";
import { formatCount } from "./format-count.ts";

describe("formatCount", () => {
    it("keeps counts under a thousand whole", () => {
        expect(formatCount(0)).toBe("0");
        expect(formatCount(999)).toBe("999");
    });

    it("shortens larger counts, with a decimal only below ten", () => {
        expect(formatCount(1_000)).toBe("1K");
        expect(formatCount(1_234)).toBe("1.2K");
        expect(formatCount(12_345)).toBe("12K");
        expect(formatCount(123_456)).toBe("123K");
        expect(formatCount(2_500_000)).toBe("2.5M");
    });

    it("never rounds up to a milestone the count hasn't reached", () => {
        expect(formatCount(1_999)).toBe("1.9K");
        expect(formatCount(9_960)).toBe("9.9K");
        expect(formatCount(999_999)).toBe("999K");
    });
});
