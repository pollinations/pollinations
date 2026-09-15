import { describe, expect, it } from "vitest";
import { signedTone, signedToneOrSoft } from "./tone";

describe("signedTone", () => {
    it("uses shared blue/red outcome colors and leaves zero neutral", () => {
        expect(signedTone(1)).toBe("text-outcome-positive-text");
        expect(signedTone(-1)).toBe("text-outcome-negative-text");
        expect(signedTone(0)).toBe("text-theme-text-strong");
    });

    it("keeps unknown values muted", () => {
        expect(signedToneOrSoft(null)).toBe("text-theme-text-soft");
    });
});
