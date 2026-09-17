import { describe, expect, it } from "vitest";
import { parseUsageDays } from "./usage.js";

describe("parseUsageDays", () => {
    it("accepts valid day counts", () => {
        expect(parseUsageDays("1")).toBe(1);
        expect(parseUsageDays("30")).toBe(30);
        expect(parseUsageDays("90")).toBe(90);
    });

    it("rejects zero, negatives and non-integers", () => {
        expect(() => parseUsageDays("0")).toThrow(
            "--days must be an integer between 1 and 90",
        );
        expect(() => parseUsageDays("-5")).toThrow(
            "--days must be an integer between 1 and 90",
        );
        expect(() => parseUsageDays("1.5")).toThrow(
            "--days must be an integer between 1 and 90",
        );
        expect(() => parseUsageDays("abc")).toThrow(
            "--days must be an integer between 1 and 90",
        );
    });

    it("rejects values above 90", () => {
        expect(() => parseUsageDays("91")).toThrow(
            "--days must be an integer between 1 and 90",
        );
    });
});