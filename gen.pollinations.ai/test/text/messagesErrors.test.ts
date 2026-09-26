import { describe, expect, it } from "vitest";
import {
    AnthropicApiError,
    anthropicErrorBody,
} from "../../src/text/messages/errors.js";

describe("anthropic error shape", () => {
    it("maps status codes to Anthropic error types", () => {
        expect(anthropicErrorBody({ status: 401, message: "bad key" })).toBe(
            JSON.stringify({
                type: "error",
                error: { type: "authentication_error", message: "bad key" },
            }),
        );
        expect(
            anthropicErrorBody({ status: 402, message: "no pollen" }),
        ).toContain("billing_error");
        expect(
            anthropicErrorBody({ status: 429, message: "slow down" }),
        ).toContain("rate_limit_error");
        expect(
            anthropicErrorBody({ status: 400, message: "bad input" }),
        ).toContain("invalid_request_error");
        expect(
            anthropicErrorBody({ status: 502, message: "upstream" }),
        ).toContain("api_error");
    });

    it("keeps AnthropicApiError status for the response envelope", () => {
        const error = new AnthropicApiError(
            502,
            "Upstream response did not include usage",
        );
        expect(error.status).toBe(502);
        expect(error.message).toContain("usage");
    });
});
