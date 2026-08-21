import { describe, expect, it } from "vitest";
import { forecastMethodLabel, runwayText, runwayValueClass } from "./RunwayTab";

describe("RunwayTab labels", () => {
    it("marks a runway that extends beyond the authored horizon", () => {
        expect(runwayText(6, true)).toBe("6+ months");
        expect(runwayText(1, false)).toBe("1 month");
        expect(runwayText(null, false)).toBe("–");
    });

    it("uses compact labels for the two forecast methods", () => {
        expect(forecastMethodLabel("last")).toBe("LAST");
        expect(forecastMethodLabel("zero")).toBe("0");
        expect(forecastMethodLabel(null)).toBeNull();
    });

    it("colors cash values without overemphasizing zeroes", () => {
        expect(runwayValueClass(10)).toBe("text-intent-success-text");
        expect(runwayValueClass(-10)).toBe("text-intent-danger-text");
        expect(runwayValueClass(0)).toBe("text-theme-text-soft");
        expect(runwayValueClass(null)).toBe("text-theme-text-soft");
    });
});
