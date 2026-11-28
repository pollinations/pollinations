import { describe, expect, it } from "vitest";
import {
    isOutageError,
    pollinationsErrorFromResponse,
} from "./error-response.js";

// Build a minimal Response good enough for the error-parsing path.
function makeErrorResponse(
    body: unknown,
    init: {
        status?: number;
        headers?: Record<string, string>;
    } = {},
): Response {
    const { status = 500, headers = {} } = init;
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

describe("pollinationsErrorFromResponse request IDs", () => {
    it("prefers the request ID from the error body", async () => {
        const err = await pollinationsErrorFromResponse(
            makeErrorResponse(
                {
                    error: {
                        message: "boom",
                        code: "INTERNAL_ERROR",
                        requestId: "req-body-123",
                    },
                },
                { headers: { "X-Request-Id": "req-header-456" } },
            ),
        );
        expect(err.requestId).toBe("req-body-123");
    });

    it("falls back to the X-Request-Id header when the body omits it", async () => {
        const err = await pollinationsErrorFromResponse(
            makeErrorResponse(
                { error: { message: "boom", code: "INTERNAL_ERROR" } },
                { headers: { "X-Request-Id": "req-header-456" } },
            ),
        );
        expect(err.requestId).toBe("req-header-456");
    });

    it("falls back to the X-Request-Id header for non-JSON bodies", async () => {
        const err = await pollinationsErrorFromResponse(
            new Response("<html>gateway timeout</html>", {
                status: 504,
                headers: { "X-Request-Id": "req-header-789" },
            }),
        );
        expect(err.requestId).toBe("req-header-789");
    });

    it("leaves requestId undefined when neither body nor header has one", async () => {
        const err = await pollinationsErrorFromResponse(
            makeErrorResponse({
                error: { message: "boom", code: "INTERNAL_ERROR" },
            }),
        );
        expect(err.requestId).toBeUndefined();
    });
});

describe("pollinationsErrorFromResponse Retry-After", () => {
    const errorWith = (retryAfter: string) =>
        makeErrorResponse(
            { error: { message: "slow down" } },
            { status: 429, headers: { "Retry-After": retryAfter } },
        );

    it("reads delay-seconds", async () => {
        const err = await pollinationsErrorFromResponse(errorWith("120"));
        expect(err.retryAfter).toBe(120);
        expect(
            (await pollinationsErrorFromResponse(errorWith("0"))).retryAfter,
        ).toBe(0);
    });

    // Number() would take these as 500s, 16s, 30.5s and 5s.
    it.each([
        "5e2",
        "0x10",
        "30.5",
        "+5",
        "-5",
        "+9999",
        "9".repeat(400),
        "January 1, 9999",
    ])("rejects %s, which is not delay-seconds", async (value: string) => {
        const err = await pollinationsErrorFromResponse(errorWith(value));
        expect(err.retryAfter).toBeUndefined();
    });

    it("reads a future HTTP date", async () => {
        const date = new Date(Date.now() + 90_000).toUTCString();
        const err = await pollinationsErrorFromResponse(errorWith(date));
        expect(err.retryAfter).toBeGreaterThanOrEqual(89);
        expect(err.retryAfter).toBeLessThanOrEqual(90);
    });

    it.each(["Sunday, 06-Nov-37 08:49:37 GMT", "Sun Nov  6 08:49:37 2037"])(
        "reads obsolete HTTP date %s",
        async (value) => {
            const err = await pollinationsErrorFromResponse(errorWith(value));
            expect(err.retryAfter).toBeGreaterThan(0);
        },
    );
});

describe("isOutageError", () => {
    it("recognises an outage from another entry point's error class", () => {
        // The root and React bundles each define their own PollinationsError.
        class OtherBundleError extends Error {
            name = "PollinationsError";
            constructor(readonly status: number) {
                super("Request failed");
            }
        }
        expect(isOutageError(new OtherBundleError(503))).toBe(true);
        expect(isOutageError(new OtherBundleError(0))).toBe(true);
        expect(isOutageError(new OtherBundleError(403))).toBe(false);
        expect(isOutageError(new Error("Failed to fetch"))).toBe(false);
    });
});
