import { resourceActionError } from "@frontend/lib/resource-action-error.ts";
import { describe, expect, it } from "vitest";

describe("resource action feedback", () => {
    it("keeps actionable validation details after the contextual message", () => {
        const detail = "Budget must be a number.";
        const message = resourceActionError(
            "save",
            "app access",
            new Error(detail),
        );
        expect(
            message.startsWith(resourceActionError("save", "app access")),
        ).toBe(true);
        expect(message).toContain(detail);
    });

    it("does not repeat feedback already contextualized by the caller", () => {
        const message = resourceActionError(
            "save",
            "app access",
            new Error("Budget must be a number."),
        );
        expect(
            resourceActionError("save", "app access", new Error(message)),
        ).toBe(message);
        const fallback = resourceActionError("save", "app access");
        expect(
            resourceActionError("save", "app access", new Error(fallback)),
        ).toBe(fallback);
    });

    it("uses the fallback for empty or unknown failures without serializing payloads", () => {
        const fallback = resourceActionError("delete", "the app key");
        for (const error of [null, undefined, {}, new Error("   ")]) {
            expect(resourceActionError("delete", "the app key", error)).toBe(
                fallback,
            );
        }
    });
});
