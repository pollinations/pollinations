import { UpstreamError } from "@shared/error.ts";
import { HttpError } from "@shared/http-error.ts";
import { describe, expect, it } from "vitest";
import { throwImageError } from "../../src/image/handler.ts";
import {
    CONTENT_POLICY_ERROR_CODE,
    CONTENT_POLICY_STATUS,
} from "../../src/image/utils/contentModeration.ts";

/**
 * Regression tests for throwImageError.
 *
 * HttpError extends UpstreamError, so the guard order matters:
 * HttpError must be checked BEFORE UpstreamError to preserve
 * HttpError-specific handling (moderation, status classification,
 * response-body extraction).  These tests lock that contract.
 */

function makeHttpError(
    message: string,
    status = 500,
    details?: Record<string, unknown>,
    upstreamUrl?: string,
) {
    return new HttpError(message, status, details, upstreamUrl);
}

describe("throwImageError", () => {
    // ── Moderation / content-policy ────────────────────────────────────

    it("wraps HttpError with moderation message as 422 content-policy violation", () => {
        const error = makeHttpError("Content flagged for: sexual", 500);

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(CONTENT_POLICY_STATUS);
            expect(up.errorCode).toBe(CONTENT_POLICY_ERROR_CODE);
            expect(up.cause).toBe(error);
        }
    });

    it("wraps plain Error with moderation message as 422 content-policy violation", () => {
        const error = new Error("Green net check failed for input image");

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(CONTENT_POLICY_STATUS);
            expect(up.errorCode).toBe(CONTENT_POLICY_ERROR_CODE);
            expect(up.cause).toBe(error);
        }
    });

    // ── Status classification ──────────────────────────────────────────

    it("maps HttpError 422 validation error to status 400", () => {
        const error = makeHttpError("Bad dimensions", 422, {
            validation: true,
        });

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(400);
            expect(up.upstreamStatus).toBe(422);
            expect(up.cause).toBe(error);
        }
    });

    it("preserves non-validation HttpError upstream status", () => {
        const error = makeHttpError("Model overloaded", 503);

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(503);
            expect(up.upstreamStatus).toBe(503);
        }
    });

    // ── Upstream response details ──────────────────────────────────────

    it("preserves upstreamUrl and responseBody from HttpError", () => {
        const upstreamBody = '{"error":"rate limit exceeded"}';
        const error = makeHttpError(
            "rate limit exceeded",
            429,
            { body: upstreamBody },
            "https://api.example.com/generate",
        );

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.requestUrl).toBeInstanceOf(URL);
            expect(up.requestUrl?.href).toBe(
                "https://api.example.com/generate",
            );
            expect(up.upstreamStatus).toBe(429);
            expect(up.responseBody).toBe(upstreamBody);
            expect(up.errorCode).toBe(error.errorCode);
        }
    });

    it("includes moderation context fields on content-policy wrap", () => {
        const error = makeHttpError(
            "Content flagged for: sexual",
            500,
            { body: '{"flag":"sexual"}' },
            "https://replicate.com/predict",
        );

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(CONTENT_POLICY_STATUS);
            expect(up.errorCode).toBe(CONTENT_POLICY_ERROR_CODE);
            expect(up.requestUrl).toBeInstanceOf(URL);
            expect(up.upstreamStatus).toBe(500);
            expect(up.responseBody).toBe('{"flag":"sexual"}');
            expect(up.cause).toBe(error);
        }
    });

    // ── Plain UpstreamError pass-through ────────────────────────────────

    it("passes plain UpstreamError through unchanged", () => {
        const error = new UpstreamError(502, {
            message: "Bad gateway",
            errorCode: "upstream_error",
        });

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBe(error);
        }
    });

    // ── Fallback 500 ───────────────────────────────────────────────────

    it("wraps non-HttpError, non-UpstreamError as 500", () => {
        const error = new Error("unexpected crash");

        try {
            throwImageError(error);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(500);
            expect(up.cause).toBe(error);
        }
    });

    it("wraps a string error as 500", () => {
        try {
            throwImageError("something broke");
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(UpstreamError);
            const up = e as UpstreamError;
            expect(up.status).toBe(500);
        }
    });
});
