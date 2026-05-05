import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";

describe("HttpError.upstreamUrl", () => {
    it("preserves the full URL including query string for observability", () => {
        const url =
            "https://ltx2-backend.pollinations.ai/result?prompt_id=abc-123";
        const err = new HttpError("Failed", 502, undefined, url);
        expect(err.upstreamUrl).toBe(url);
    });

    it("returns undefined when no URL is provided", () => {
        const err = new HttpError("Failed", 502);
        expect(err.upstreamUrl).toBeUndefined();
    });
});
