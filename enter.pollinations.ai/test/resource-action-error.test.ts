import { resourceActionError } from "@frontend/lib/resource-action-error.ts";
import { describe, expect, it } from "vitest";

describe("resource action feedback", () => {
    it.each([
        ["create", "the secret key", "Failed to create API key"],
        ["save", "the app key", "Failed to save key. Please try again."],
        ["save", "app access", "Failed to save key metadata"],
        ["delete", "the model", "Request failed"],
        ["save", "the agent", "Request failed"],
    ] as const)("does not append a generic %s failure for %s", (action, subject, detail) => {
        expect(
            resourceActionError(action, subject, new Error(` ${detail} `)),
        ).toBe(resourceActionError(action, subject));
    });

    it("preserves specific details even when they start with a generic failure", () => {
        const detail = "Request failed: endpoint returned 403 Forbidden.";
        expect(
            resourceActionError("save", "the model", new Error(detail)),
        ).toBe(`Couldn’t save the model. ${detail}`);
    });

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
