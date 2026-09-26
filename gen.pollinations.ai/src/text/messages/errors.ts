import { handleError } from "@shared/error.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

const ANTHROPIC_ERROR_TYPE_BY_STATUS: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    402: "billing_error",
    403: "permission_error",
    404: "not_found_error",
    413: "request_too_large",
    422: "invalid_request_error",
    429: "rate_limit_error",
    503: "overloaded_error",
};

export function anthropicErrorType(status?: number): string {
    if (status && ANTHROPIC_ERROR_TYPE_BY_STATUS[status]) {
        return ANTHROPIC_ERROR_TYPE_BY_STATUS[status];
    }
    return "api_error";
}

async function toAnthropicErrorResponse(response: Response): Promise<Response> {
    let message = "Internal server error";
    try {
        const body = (await response.clone().json()) as {
            error?: { message?: string };
        };
        message = body.error?.message || message;
    } catch {
        // Non-JSON error bodies fall back to the generic message above.
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.delete("Content-Length");

    return new Response(
        JSON.stringify({
            type: "error",
            error: { type: anthropicErrorType(response.status), message },
        }),
        { status: response.status, headers },
    );
}

/**
 * Every other route lets the app-wide `onError` shape failures as the OpenAI
 * envelope. `/v1/messages` needs Anthropic's `{type:"error",error:{...}}`
 * shape instead, for the same thrown errors (auth, billing, rate limits,
 * upstream failures) — so its own Hono sub-app registers this as its
 * `onError` (Hono resolves a thrown error against the nearest mounted app,
 * never a middleware's own try/catch) and re-shapes whatever `handleError`
 * would have produced, preserving status and headers (Retry-After included)
 * unchanged.
 */
export async function anthropicErrorHandler(
    err: Error,
    c: Context<Env>,
): Promise<Response> {
    const response = await handleError(err, c);
    return toAnthropicErrorResponse(response);
}
