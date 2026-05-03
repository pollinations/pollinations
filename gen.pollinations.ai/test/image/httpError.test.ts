import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";

describe("HttpError.upstreamUrl", () => {
    it("strips query strings to avoid leaking job IDs and tokens", () => {
        const err = new HttpError(
            "Failed",
            502,
            undefined,
            "https://ltx2-backend.pollinations.ai/result?prompt_id=secret-id",
        );
        expect(err.upstreamUrl).toBe(
            "https://ltx2-backend.pollinations.ai/result",
        );
    });

    it("preserves origin and pathname", () => {
        const err = new HttpError(
            "Failed",
            502,
            undefined,
            "https://example.com/api/v1/foo?token=abc&id=42",
        );
        expect(err.upstreamUrl).toBe("https://example.com/api/v1/foo");
    });

    it("returns undefined for malformed URLs rather than leaking the raw input", () => {
        const err = new HttpError("Failed", 502, undefined, "not a url");
        expect(err.upstreamUrl).toBeUndefined();
    });

    it("returns undefined when no URL is provided", () => {
        const err = new HttpError("Failed", 502);
        expect(err.upstreamUrl).toBeUndefined();
    });
});
