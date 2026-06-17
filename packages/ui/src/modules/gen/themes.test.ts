import { describe, expect, it } from "vitest";
import { getModalityKey } from "./themes.ts";

// The only real logic is getModalityKey(): case-folding + plural aliases, plus
// the null contract that callers' `?? fallback` depend on.
describe("getModalityKey", () => {
    it("normalizes case and plural aliases, and returns null for unknown", () => {
        expect(getModalityKey("image")).toBe("image");
        expect(getModalityKey("Images")).toBe("image");
        expect(getModalityKey("AUDIO")).toBe("audio");
        expect(getModalityKey("realtime")).toBe("realtime");
        expect(getModalityKey("Embeddings")).toBe("embedding");
        expect(getModalityKey("nope")).toBeNull();
        expect(getModalityKey("")).toBeNull();
    });
});
