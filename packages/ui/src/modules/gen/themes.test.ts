import { describe, expect, it } from "vitest";
import { getModalityTheme } from "./themes.ts";

// The only real logic here is normalize(): case-folding + plural aliases, plus
// the null contract that callers' `?? fallback` depends on. The 1:1 theme table
// is type-checked (Record<ModelCategory, ThemeName>), so it needs no test.
describe("getModalityTheme", () => {
    it("normalizes case and plural aliases, and returns null for unknown", () => {
        expect(getModalityTheme("image")).toBe("pink");
        expect(getModalityTheme("Images")).toBe("pink");
        expect(getModalityTheme("AUDIO")).toBe("amber");
        expect(getModalityTheme("realtime")).toBe("coral");
        expect(getModalityTheme("Embeddings")).toBe("violet");
        expect(getModalityTheme("nope")).toBeNull();
        expect(getModalityTheme("")).toBeNull();
    });
});
