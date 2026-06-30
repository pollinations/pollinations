import { describe, expect, it } from "vitest";
import {
    isSocialProvider,
    SOCIAL_PROVIDER_LABELS,
} from "./social-providers.ts";

describe("isSocialProvider", () => {
    it("accepts known providers", () => {
        expect(isSocialProvider("github")).toBe(true);
        expect(isSocialProvider("google")).toBe(true);
    });
    it("rejects unknown values", () => {
        expect(isSocialProvider("twitter")).toBe(false);
        expect(isSocialProvider(42)).toBe(false);
        expect(isSocialProvider(undefined)).toBe(false);
    });
    it("has a label for every provider", () => {
        expect(SOCIAL_PROVIDER_LABELS.github).toBe("GitHub");
        expect(SOCIAL_PROVIDER_LABELS.google).toBe("Google");
    });
});
