import { UpstreamError } from "@shared/error.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
    anthropicErrorType,
    anthropicRetryAfter,
    messagesErrorBody,
    messagesErrorEnvelope,
    messagesErrorEventText,
    toAnthropicErrorBody,
} from "@/text/messages/errors.ts";

describe("anthropicErrorType", () => {
    it.each([
        [400, "invalid_request_error"],
        [401, "authentication_error"],
        [402, "billing_error"],
        [403, "permission_error"],
        [404, "not_found_error"],
        [413, "request_too_large"],
        [429, "rate_limit_error"],
        [500, "api_error"],
        [502, "api_error"],
        [503, "overloaded_error"],
        [529, "overloaded_error"],
    ])("maps %i to %s", (status, type) => {
        expect(anthropicErrorType(status)).toBe(type);
    });
});

describe("toAnthropicErrorBody", () => {
    it("keeps status and message from HTTP errors", () => {
        const { status, body } = toAnthropicErrorBody(
            new HTTPException(401, { message: "bad key" }),
        );
        expect(status).toBe(401);
        expect(body).toEqual({
            type: "error",
            error: { type: "authentication_error", message: "bad key" },
        });
    });

    it("maps UpstreamError statuses", () => {
        const { status, body } = toAnthropicErrorBody(
            new UpstreamError(429, { message: "slow down" }),
        );
        expect(status).toBe(429);
        expect(body.error.type).toBe("rate_limit_error");
    });

    it("falls back to a 500 api_error", () => {
        const { status, body } = toAnthropicErrorBody(new Error("boom"));
        expect(status).toBe(500);
        expect(body).toEqual({
            type: "error",
            error: { type: "api_error", message: "boom" },
        });
    });
});

describe("anthropicRetryAfter", () => {
    it("ceils fractional upstream values to an integer", () => {
        const error = new UpstreamError(429, { message: "slow" });
        (error as { upstreamHeaders?: Record<string, string> }).upstreamHeaders = {
            "retry-after": "1.5",
        };
        expect(anthropicRetryAfter(error)).toBe("2");
    });

    it("defaults to an integer when nothing was set", () => {
        expect(anthropicRetryAfter(new UpstreamError(429, {}))).toMatch(/^\d+$/);
    });
});

describe("messagesErrorEnvelope", () => {
    function appWithfailure(failure: unknown) {
        const app = new Hono();
        app.use("/v1/messages", messagesErrorEnvelope);
        app.post("/v1/messages", () => {
            throw failure;
        });
        return app;
    }

    it("renders a 401 in Anthropic shape", async () => {
        const response = await appWithfailure(
            new HTTPException(401, { message: "Invalid API key" }),
        ).request("/v1/messages", { method: "POST" });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            type: "error",
            error: { type: "authentication_error", message: "Invalid API key" },
        });
    });

    it("renders a 429 with an integer retry-after", async () => {
        const app = new Hono();
        app.use("/v1/messages", messagesErrorEnvelope);
        app.post("/v1/messages", (c) => {
            c.header("Retry-After", "45");
            throw new UpstreamError(429, { message: "slow down" });
        });
        const response = await app.request("/v1/messages", { method: "POST" });
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("45");
        expect(await response.json()).toMatchObject({
            type: "error",
            error: { type: "rate_limit_error" },
        });
    });

    it("adds a default integer retry-after when none was set", async () => {
        const response = await appWithfailure(
            new UpstreamError(429, { message: "slow down" }),
        ).request("/v1/messages", { method: "POST" });
        expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
    });
});

describe("balance-notice helpers", () => {
    it("builds a billing_error body and SSE event", () => {
        expect(messagesErrorBody("no funds")).toEqual({
            type: "error",
            error: { type: "billing_error", message: "no funds" },
        });
        const text = messagesErrorEventText("no funds");
        expect(text.startsWith("event: error\ndata: ")).toBe(true);
        expect(JSON.parse(text.split("data: ")[1])).toEqual(
            messagesErrorBody("no funds"),
        );
    });
});
