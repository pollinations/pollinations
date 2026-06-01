import { describe, expect, it } from "vitest";
import { cn } from "./cn-app.ts";

describe("cn app helper", () => {
    it("merges conflicting unprefixed tailwind classes with the last class winning", () => {
        expect(cn("bg-amber-200", "bg-amber-300")).toBe("bg-amber-300");
    });

    it("drops falsy inputs", () => {
        expect(cn("p-2", false, null, undefined, "")).toBe("p-2");
    });
});
