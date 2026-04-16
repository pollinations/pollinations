import { describe, expect, it } from "vitest";
import { resolveEffectiveSafety } from "@/middleware/safety.ts";

describe("resolveEffectiveSafety", () => {
    it("returns empty set when both sources are undefined", () => {
        expect(resolveEffectiveSafety(undefined, undefined).size).toBe(0);
    });

    it("parses comma-separated features", () => {
        const result = resolveEffectiveSafety(null, "privacy,secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("ignores invalid feature names", () => {
        const result = resolveEffectiveSafety(null, "privacy,bogus,secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("unions key-level and request-level features", () => {
        const result = resolveEffectiveSafety("privacy", "secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("key-level features cannot be removed by request", () => {
        const result = resolveEffectiveSafety("privacy,secrets", "nsfw");
        expect(result).toEqual(new Set(["privacy", "secrets", "nsfw"]));
    });

    it("accepts 'true' as a valid feature", () => {
        const result = resolveEffectiveSafety(null, "true");
        expect(result).toEqual(new Set(["true"]));
    });
});
