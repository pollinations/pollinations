import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
    anthropicErrorHandler,
    anthropicErrorType,
} from "../../src/text/messages/errors.js";

describe("anthropicErrorType", () => {
    it("maps known statuses to Anthropic error types", () => {
        expect(anthropicErrorType(401)).toBe("authentication_error");
        expect(anthropicErrorType(402)).toBe("billing_error");
        expect(anthropicErrorType(429)).toBe("rate_limit_error");
        expect(anthropicErrorType(400)).toBe("invalid_request_error");
        expect(anthropicErrorType(500)).toBe("api_error");
        expect(anthropicErrorType(504)).toBe("api_error");
    });
});

describe("anthropicErrorHandler", () => {
    it("reshapes a thrown HTTPException into Anthropic's error envelope", async () => {
        const app = new Hono();
        app.onError(anthropicErrorHandler as never);
        app.get("/", (c) => {
            c.header("Retry-After", "3");
            throw new HTTPException(429, {
                message: "You're making requests too quickly.",
            });
        });

        const res = await app.request("/");

        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("3");
        expect(await res.json()).toEqual({
            type: "error",
            error: {
                type: "rate_limit_error",
                message: "You're making requests too quickly.",
            },
        });
    });

    it("maps 402 billing failures to billing_error", async () => {
        const app = new Hono();
        app.onError(anthropicErrorHandler as never);
        app.get("/", () => {
            throw new HTTPException(402, {
                message: "Insufficient pollen balance.",
            });
        });

        const res = await app.request("/");

        expect(res.status).toBe(402);
        expect(await res.json()).toEqual({
            type: "error",
            error: {
                type: "billing_error",
                message: "Insufficient pollen balance.",
            },
        });
    });
});
