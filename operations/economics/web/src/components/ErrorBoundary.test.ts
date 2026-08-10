import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary.getDerivedStateFromError", () => {
    it("uses the message for Error instances", () => {
        expect(
            ErrorBoundary.getDerivedStateFromError(new Error("boom")),
        ).toEqual({ error: "boom" });
    });

    it("stringifies non-Error values", () => {
        expect(ErrorBoundary.getDerivedStateFromError("raw string")).toEqual({
            error: "raw string",
        });
    });
});
