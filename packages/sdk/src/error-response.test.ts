import { describe, expect, it } from "vitest";
import { pollinationsErrorFromResponse } from "./error-response.js";

function makeErrorResponse(
    body: unknown,
    headers: Record<string, string> = {},
): Response {
    const headerMap = new Map(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
        ok: false,
        status: 400,
        headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
    } as unknown as Response;
}

describe("pollinationsErrorFromResponse", () => {
    it("uses requestId from the error body", async () => {
        const response = makeErrorResponse(
            {
                error: {
                    message: "Bad request",
                    code: "INVALID_REQUEST",
                    requestId: "req-abc-123",
                },
            },
            { "X-Request-Id": "req-header-456" },
        );
        const error = await pollinationsErrorFromResponse(response);
        expect(error.requestId).toBe("req-abc-123");
    });

    it("falls back to X-Request-Id header when body omits requestId", async () => {
        const response = makeErrorResponse(
            {
                error: {
                    message: "Bad request",
                    code: "INVALID_REQUEST",
                },
            },
            { "X-Request-Id": "req-header-789" },
        );
        const error = await pollinationsErrorFromResponse(response);
        expect(error.requestId).toBe("req-header-789");
    });

    it("returns undefined when neither body nor header has requestId", async () => {
        const response = makeErrorResponse({
            error: { message: "Bad request" },
        });
        const error = await pollinationsErrorFromResponse(response);
        expect(error.requestId).toBeUndefined();
    });

    it("parses flat error body (no nested error)", async () => {
        const response = makeErrorResponse(
            { message: "Not found", code: "NOT_FOUND" },
            { "X-Request-Id": "req-flat" },
        );
        const error = await pollinationsErrorFromResponse(response);
        expect(error.message).toBe("Not found");
        expect(error.requestId).toBe("req-flat");
    });

    it("handles non-JSON response body", async () => {
        const response = {
            ok: false,
            status: 500,
            headers: {
                get: (name: string) =>
                    name.toLowerCase() === "x-request-id" ? "req-500" : null,
            },
            json: async () => {
                throw new Error("not json");
            },
        } as unknown as Response;
        const error = await pollinationsErrorFromResponse(response);
        expect(error.message).toBe("Request failed with status 500");
        expect(error.requestId).toBe("req-500");
    });
});
