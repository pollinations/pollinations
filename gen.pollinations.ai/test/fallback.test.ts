import { describe, expect, it } from "vitest";
import { isRetryableFallbackError } from "../src/fallback.ts";
import { HttpError } from "../src/image/httpError.ts";

/**
 * The single decision point every modality shares, so the cases that must never
 * fail over — and the ones that must — are pinned here rather than per handler.
 */
describe("isRetryableFallbackError", () => {
    // The text client remaps before throwing and keeps the raw status.
    const textFailure = (
        upstreamStatus: number,
        details?: unknown,
    ): Error & { status: number; upstreamStatus: number; details?: unknown } =>
        Object.assign(new Error(`${upstreamStatus} upstream`), {
            status: upstreamStatus === 429 ? 502 : upstreamStatus,
            upstreamStatus,
            details,
        });

    it("fails over on a rate-limited or broken upstream", () => {
        expect(isRetryableFallbackError(textFailure(429))).toBe(true);
        expect(isRetryableFallbackError(textFailure(503))).toBe(true);
        expect(isRetryableFallbackError(new HttpError("down", 500))).toBe(true);
        expect(isRetryableFallbackError(new HttpError("no quota", 402))).toBe(
            true,
        );
    });

    it("does not fail over on caller errors", () => {
        expect(isRetryableFallbackError(textFailure(400))).toBe(false);
        expect(isRetryableFallbackError(new HttpError("bad input", 422))).toBe(
            false,
        );
    });

    it("does not shop a content-policy refusal to a laxer endpoint", () => {
        expect(
            isRetryableFallbackError(
                textFailure(500, {
                    error: { message: "content policy violation" },
                }),
            ),
        ).toBe(false);
        expect(
            isRetryableFallbackError(
                new HttpError("upstream failed", 502, {
                    body: JSON.stringify({ detail: "flagged as sensitive" }),
                }),
            ),
        ).toBe(false);
    });

    it("fails over when the provider blocked our account, not the prompt", () => {
        // Azure suspends the whole deployment and says "content policy" while
        // doing it; a sibling endpoint still serves, so this must retry.
        expect(
            isRetryableFallbackError(
                textFailure(500, {
                    error: {
                        message:
                            "Your resource has been temporarily blocked for content policy reasons",
                    },
                }),
            ),
        ).toBe(true);
    });

    it("fails over on a network-level failure but not on our own bugs", () => {
        expect(isRetryableFallbackError(new TypeError("fetch failed"))).toBe(
            true,
        );
        expect(
            isRetryableFallbackError(
                new TypeError("Cannot read properties of undefined"),
            ),
        ).toBe(false);
        expect(isRetryableFallbackError(new Error("misconfigured"))).toBe(
            false,
        );
        expect(isRetryableFallbackError("not an error")).toBe(false);
    });
});
