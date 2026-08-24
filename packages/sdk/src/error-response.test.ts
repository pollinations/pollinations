import { describe, expect, it } from "vitest";
import { pollinationsErrorFromResponse } from "./error-response.js";
import { PollinationsError } from "./types.js";

function createMockResponse(
    body: unknown,
    options: {
        status?: number;
        headers?: Record<string, string>;
    } = {},
): Response {
    const { status = 500, headers = {} } = options;
    const headerMap = new Map<string, string>(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );

    return {
        status,
        headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
        },
        json: async () => {
            if (typeof body === "string") {
                return JSON.parse(body);
            }
            if (body === null || body === undefined) {
                throw new Error("Invalid JSON");
            }
            return body;
        },
    } as unknown as Response;
}

describe("pollinationsErrorFromResponse", () => {
    it("extracts requestId from nested error body", async () => {
        const response = createMockResponse(
            {
                error: {
                    message: "Rate limit exceeded",
                    code: "RATE_LIMIT_EXCEEDED",
                    requestId: "req_body_nested_123",
                },
            },
            { status: 429 },
        );

        const error = await pollinationsErrorFromResponse(response);

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.message).toBe("Rate limit exceeded");
        expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(error.status).toBe(429);
        expect(error.requestId).toBe("req_body_nested_123");
    });

    it("extracts requestId from flat error body", async () => {
        const response = createMockResponse(
            {
                message: "Unauthorized",
                code: "UNAUTHORIZED",
                requestId: "req_body_flat_456",
            },
            { status: 401 },
        );

        const error = await pollinationsErrorFromResponse(response);

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.requestId).toBe("req_body_flat_456");
    });

    it("falls back to x-request-id header when body omits requestId", async () => {
        const response = createMockResponse(
            {
                error: {
                    message: "Internal Server Error",
                    code: "INTERNAL_ERROR",
                },
            },
            {
                status: 500,
                headers: { "x-request-id": "req_header_789" },
            },
        );

        const error = await pollinationsErrorFromResponse(response);

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.requestId).toBe("req_header_789");
    });

    it("falls back to X-Request-Id header on non-JSON responses", async () => {
        const response = createMockResponse(null, {
            status: 502,
            headers: { "X-Request-Id": "req_header_bad_gateway" },
        });

        const error = await pollinationsErrorFromResponse(response);

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.message).toBe("Request failed with status 502");
        expect(error.requestId).toBe("req_header_bad_gateway");
    });

    it("prioritizes body requestId over header x-request-id when both exist", async () => {
        const response = createMockResponse(
            {
                error: {
                    message: "Quota reached",
                    requestId: "req_from_body",
                },
            },
            {
                status: 402,
                headers: { "x-request-id": "req_from_header" },
            },
        );

        const error = await pollinationsErrorFromResponse(response);

        expect(error.requestId).toBe("req_from_body");
    });

    it("leaves requestId undefined when not present in body or headers", async () => {
        const response = createMockResponse(
            {
                error: {
                    message: "Generic error",
                },
            },
            { status: 500 },
        );

        const error = await pollinationsErrorFromResponse(response);

        expect(error.requestId).toBeUndefined();
    });
});
