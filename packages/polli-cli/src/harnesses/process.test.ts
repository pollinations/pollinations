import { describe, expect, it } from "vitest";
import { requireCompatibleVersion } from "./process.js";

describe("harness version compatibility", () => {
    it("accepts a supported release", () => {
        expect(
            requireCompatibleVersion(
                "Router",
                "router v3.1.1",
                "3.1.1",
                "4.0.0",
            ),
        ).toBe("3.1.1");
    });

    it.each(["3.1.0", "4.0.0"])("rejects version skew: %s", (version) => {
        expect(() =>
            requireCompatibleVersion("Router", version, "3.1.1", "4.0.0"),
        ).toThrow("unsupported");
    });

    it("rejects unreadable output", () => {
        expect(() =>
            requireCompatibleVersion("Router", "unknown", "3.1.1", "4.0.0"),
        ).toThrow("Could not read");
    });
});
