import { describe, expect, it } from "vitest";
import { canonicalVendor } from "./tb";

describe("canonicalVendor", () => {
    it("normalizes the Vast Pollen alias", () => {
        expect(canonicalVendor("vast")).toBe("vast.ai");
    });

    it("leaves canonical vendors unchanged", () => {
        expect(canonicalVendor("openai")).toBe("openai");
    });
});
