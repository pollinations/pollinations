import { describe, expect, it, vi } from "vitest";
import {
    type FallbackCandidate,
    isRetryableFallbackError,
    withModelFallback,
} from "../src/fallback.ts";
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

describe("withModelFallback", () => {
    const candidate = (id: string): FallbackCandidate => ({ id });
    const rateLimited = () =>
        Object.assign(new Error("429 upstream"), {
            status: 502,
            upstreamStatus: 429,
        });

    it("reports every model whose upstream failed, the last one included", async () => {
        const reported: string[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second"), candidate("third")],
                attempt,
                (failed) => reported.push(failed.id),
            ),
        ).rejects.toThrow("429 upstream");

        // Every candidate was tried exactly once, and none of the failures is
        // missing from the record — the terminal one used to be dropped.
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(reported).toEqual(["primary", "second", "third"]);
    });

    it("reports the failure that stopped the request even when it is not retryable", async () => {
        const reported: string[] = [];
        const badRequest = Object.assign(new Error("400 upstream"), {
            status: 400,
            upstreamStatus: 400,
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second")],
                async () => {
                    throw badRequest;
                },
                (failed) => reported.push(failed.id),
            ),
        ).rejects.toThrow("400 upstream");

        // A caller error stops the chain, but the model that produced it is
        // still named rather than left to the requested model's record.
        expect(reported).toEqual(["primary"]);
    });

    it("reports nothing and stops calling once a model serves", async () => {
        const reported: string[] = [];
        const attempt = vi
            .fn<(c: FallbackCandidate) => Promise<string>>()
            .mockRejectedValueOnce(rateLimited())
            .mockResolvedValueOnce("served");

        const {
            result,
            candidate: served,
            index,
        } = await withModelFallback(
            [candidate("primary"), candidate("second"), candidate("third")],
            attempt,
            (failed) => reported.push(failed.id),
        );

        expect(result).toBe("served");
        expect(served.id).toBe("second");
        expect(index).toBe(1);
        expect(reported).toEqual(["primary"]);
        expect(attempt).toHaveBeenCalledTimes(2);
    });
});
