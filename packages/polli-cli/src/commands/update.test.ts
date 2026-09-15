import { describe, it, expect } from "vitest";
import { isNewer } from "./update.js";

describe("isNewer", () => {
    it("detects a newer version", () => {
        expect(isNewer("0.1.16", "0.1.15")).toBe(true);
        expect(isNewer("1.0.0", "0.9.9")).toBe(true);
        expect(isNewer("0.2.0", "0.1.99")).toBe(true);
    });
    it("returns false for equal or older", () => {
        expect(isNewer("0.1.15", "0.1.15")).toBe(false);
        expect(isNewer("0.1.14", "0.1.15")).toBe(false);
        expect(isNewer("0.1.10", "0.2.0")).toBe(false);
    });
    it("handles mismatched segment lengths", () => {
        expect(isNewer("0.1.15.1", "0.1.15")).toBe(true);
        expect(isNewer("0.1.15", "0.1.15.1")).toBe(false);
    });
    it("returns false on malformed input", () => {
        expect(isNewer("a.b.c", "0.1.15")).toBe(false);
        expect(isNewer("", "")).toBe(false);
    });
});
