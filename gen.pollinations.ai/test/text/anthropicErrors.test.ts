import { describe, expect, it } from "vitest";
import {
    AnthropicRequestError,
    anthropicErrorBody,
    statusToErrorType,
} from "../../src/text/anthropic/errors.ts";

describe("anthropic error shape", () => {
    it("maps status codes to Anthropic error types", () => {
        expect(statusToErrorType(400)).toBe("invalid_request_error");
        expect(statusToErrorType(401)).toBe("authentication_error");
        expect(statusToErrorType(402)).toBe("billing_error");
        expect(statusToErrorType(403)).toBe("authentication_error");
        expect(statusToErrorType(404)).toBe("not_found_error");
        expect(statusToErrorType(429)).toBe("rate_limit_error");
        expect(statusToErrorType(529)).toBe("overloaded_error");
        expect(statusToErrorType(500)).toBe("api_error");
    });

    it("builds the Anthropic envelope", () => {
        expect(anthropicErrorBody("authentication_error", "bad key")).toEqual({
            type: "error",
            error: { type: "authentication_error", message: "bad key" },
        });
    });

    it("carries a status on the request error", () => {
        const error = new AnthropicRequestError(
            "invalid_request_error",
            "nope",
            400,
        );
        expect(error.status).toBe(400);
        expect(error.type).toBe("invalid_request_error");
    });
});
