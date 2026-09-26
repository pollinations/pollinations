// Anthropic error shape and status mapping.
//
// Anthropic clients (SDKs, Claude Code) branch on the error envelope and the
// HTTP status: `{"type":"error","error":{"type","message"}}` with 401
// authentication_error, 402 billing_error, 429 rate_limit_error (integer
// `retry-after`), 400 invalid_request_error, 404 not_found_error, 529
// overloaded_error. The gateway's default error shape is Pollinations' own,
// so every failure on the Messages endpoint is re-mapped here.

import type { AnthropicErrorType } from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export class AnthropicRequestError extends Error {
    readonly type: AnthropicErrorType;
    readonly status: number;
    readonly detail?: string;

    constructor(
        type: AnthropicErrorType,
        message: string,
        status: number,
        detail?: string,
    ) {
        super(message);
        this.name = "AnthropicRequestError";
        this.type = type;
        this.status = status;
        this.detail = detail;
    }
}

/** Anthropic's status -> error-type table. */
export function statusToErrorType(status: number): AnthropicErrorType {
    switch (status) {
        case 400:
            return "invalid_request_error";
        case 401:
            return "authentication_error";
        case 402:
            return "billing_error";
        case 403:
            return "authentication_error";
        case 404:
            return "not_found_error";
        case 429:
            return "rate_limit_error";
        case 529:
            return "overloaded_error";
        default:
            return status >= 500 ? "api_error" : "invalid_request_error";
    }
}

export const anthropicErrorBody = (
    type: AnthropicErrorType,
    message: string,
): { type: "error"; error: { type: AnthropicErrorType; message: string } } => ({
    type: "error",
    error: { type, message },
});

/** Extract the status an upstream/HTTP error should surface as. */
function statusOf(error: unknown): number {
    if (error instanceof AnthropicRequestError) return error.status;
    if (error instanceof HTTPException) return error.status;
    const candidate = error as { status?: unknown } | undefined;
    if (candidate && typeof candidate.status === "number") {
        return candidate.status;
    }
    return 500;
}

function messageOf(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "An unexpected error occurred.";
}

/**
 * Write an error response in Anthropic's shape. `retry-after` is echoed as
 * an integer when the upstream supplied one, so SDK retry/backoff works.
 */
export function anthropicErrorResponse(c: Context, error: unknown): Response {
    const status = statusOf(error);
    const type = statusToErrorType(status);
    const response = c.json(
        anthropicErrorBody(type, messageOf(error)),
        status as 400,
    );

    const retryAfter = (error as { retryAfter?: unknown } | undefined)
        ?.retryAfter;
    if (status === 429) {
        const seconds =
            typeof retryAfter === "number" && Number.isFinite(retryAfter)
                ? Math.trunc(retryAfter)
                : 1;
        response.headers.set("retry-after", String(Math.max(1, seconds)));
    }
    return response;
}
