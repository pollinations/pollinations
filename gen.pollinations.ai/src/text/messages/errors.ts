import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Anthropic-shaped errors for POST /v1/messages.
 *
 * The global text error funnel renders OpenAI-style envelopes; the
 * Messages API must render `{type:"error",error:{type,message}}` with
 * Anthropic's status semantics so SDK retries and Claude Code error
 * handling work.
 *
 * @see https://platform.claude.com/docs/en/api/errors
 */

type AnthropicErrorType =
    | "invalid_request_error"
    | "authentication_error"
    | "billing_error"
    | "permission_error"
    | "not_found_error"
    | "request_too_large"
    | "rate_limit_error"
    | "api_error"
    | "overloaded_error";

function anthropicErrorType(status: number): AnthropicErrorType {
    if (status === 401) return "authentication_error";
    if (status === 402) return "billing_error";
    if (status === 403) return "permission_error";
    if (status === 404) return "not_found_error";
    if (status === 413) return "request_too_large";
    if (status === 429) return "rate_limit_error";
    if (status === 529) return "overloaded_error";
    if (status >= 500) return "api_error";
    return "invalid_request_error";
}

export interface AnthropicErrorInput {
    status: number;
    message: string;
    /** HTTP header value for `retry-after`; 429 responses must carry an integer. */
    retryAfterSeconds?: number;
}

export function anthropicErrorBody({
    message,
    status,
}: AnthropicErrorInput): string {
    return JSON.stringify({
        type: "error",
        error: { type: anthropicErrorType(status), message },
    });
}

/** Render any thrown value as an Anthropic error response. */
export function anthropicErrorResponse(thrown: unknown): Response {
    let status = 500;
    let message = "Internal server error";
    let retryAfterSeconds: number | undefined;
    if (thrown && typeof thrown === "object") {
        const error = thrown as {
            status?: unknown;
            message?: unknown;
            retryAfterSeconds?: unknown;
            getResponse?: unknown;
        };
        if (typeof error.status === "number") status = error.status;
        else if (typeof error.code === "number") status = error.code;
        if (typeof error.message === "string" && error.message) {
            message = error.message;
        }
        if (typeof error.retryAfterSeconds === "number") {
            retryAfterSeconds = error.retryAfterSeconds;
        }
        // HTTPException carries its own Response; reuse its status/body.
        if (typeof error.getResponse === "function") {
            const response = error.getResponse();
            if (response) {
                status = response.status;
                try {
                    const text = response.text ? undefined : undefined;
                    void text;
                } catch {
                    /* body may be locked; status is what matters */
                }
            }
        }
    }
    const headers = new Headers({ "content-type": "application/json" });
    if (status === 429) {
        headers.set(
            "retry-after",
            String(
                Number.isInteger(retryAfterSeconds) && retryAfterSeconds
                    ? retryAfterSeconds
                    : 1,
            ),
        );
    }
    return new Response(
        anthropicErrorBody({ status, message, retryAfterSeconds }),
        { status: status as ContentfulStatusCode, headers },
    );
}

/** Thrown inside messages handlers to surface an Anthropic-shaped error. */
export class AnthropicApiError extends Error {
    status: ContentfulStatusCode;
    retryAfterSeconds?: number;

    constructor(status: number, message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = "AnthropicApiError";
        this.status = status as ContentfulStatusCode;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/** Hono middleware: render any downstream error in Anthropic's shape. */
export async function anthropicErrorEnvelope(
    _c: Context,
    next: () => Promise<void>,
): Promise<Response | undefined> {
    try {
        await next();
    } catch (thrown) {
        return anthropicErrorResponse(thrown);
    }
}
