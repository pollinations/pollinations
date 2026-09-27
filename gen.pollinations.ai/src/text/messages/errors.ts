// Anthropic-shaped errors for POST /v1/messages:
// `{type:"error",error:{type,message}}` with Anthropic status semantics.
import { UpstreamError, getDefaultErrorMessage } from "@shared/error.ts";
import type { MessagesError } from "@shared/schemas/anthropic.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";

function errorStatus(error: unknown): number {
    if (error instanceof HTTPException) return error.status;
    if (error && typeof error === "object") {
        const status = (error as { status?: unknown }).status;
        if (typeof status === "number" && Number.isInteger(status)) {
            return status;
        }
        const code = (error as { code?: unknown }).code;
        if (typeof code === "number" && Number.isInteger(code)) return code;
    }
    return 500;
}

function errorMessage(error: unknown, status: number): string {
    if (error instanceof UpstreamError && error.responseBody) {
        const extracted = extractUpstreamMessage(error.responseBody);
        if (extracted) return extracted;
    }
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message) return message;
    }
    return getDefaultErrorMessage(status);
}

function extractUpstreamMessage(body: string): string | undefined {
    try {
        const parsed = JSON.parse(body);
        const extracted =
            parsed?.error?.message || parsed?.message ||
            (typeof parsed?.error === "string" ? parsed.error : null);
        if (typeof extracted === "string" && extracted) return extracted;
    } catch {
        // Not JSON — fall through.
    }
    return undefined;
}

/** Map an HTTP status to the Anthropic error type clients branch on. */
export function anthropicErrorType(status: number): string {
    switch (status) {
        case 400:
            return "invalid_request_error";
        case 401:
            return "authentication_error";
        case 402:
            return "billing_error";
        case 403:
            return "permission_error";
        case 404:
            return "not_found_error";
        case 413:
            return "request_too_large";
        case 429:
            return "rate_limit_error";
        case 503:
        case 529:
            return "overloaded_error";
        default:
            return "api_error";
    }
}

/** Integer `retry-after` seconds for 429s; providers omit or fractionalize. */
export function anthropicRetryAfter(error: unknown): string {
    const fromUpstream =
        error instanceof UpstreamError
            ? error.upstreamHeaders?.["retry-after"]
            : undefined;
    const parsed =
        typeof fromUpstream === "string" ? Number(fromUpstream) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) {
        return String(Math.max(1, Math.ceil(parsed)));
    }
    return "60";
}

export function toAnthropicErrorBody(error: unknown): {
    status: ContentfulStatusCode;
    body: MessagesError;
} {    const rawStatus = errorStatus(error);
    const status = (
        rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500
    ) as ContentfulStatusCode;
    return {
        status,
        body: {
            type: "error",
            error: {
                type: anthropicErrorType(status),
                message: errorMessage(error, status),
            },
        },
    };
}

function extractReturnedMessage(body: unknown): string | undefined {
    if (!body || typeof body !== "object") {
        return typeof body === "string" && body ? body : undefined;
    }
    const record = body as {
        error?: { message?: unknown } | string;
        message?: unknown;
    };
    const message =
        (typeof record.error === "object"
            ? record.error?.message
            : record.error) ?? record.message;
    return typeof message === "string" && message ? message : undefined;
}

/**
 * Route envelope: everything thrown downstream of this middleware —
 * validation, model resolution, auth, balance, rate limits, generation —
 * renders in Anthropic's shape with the original status code.
 *
 * Hono note: `compose` catches downstream throws and routes them through
 * `onError` (default: plain-text `HTTPException.getResponse()`), so
 * `await next()` does NOT reject for handler throws. Thrown errors surface
 * here via `c.error` + `c.res` (text/plain, headers like Retry-After
 * preserved). Returned (non-thrown) JSON errors, such as the frontend-key
 * 429, are normalized the same way.
 */
export const messagesErrorEnvelope = createMiddleware<Env>(
    async (c, next) => {
        await next();
        const res = c.res;
        if (!res || res.status < 400) return;
        const thrown =
            (c as unknown as { error?: unknown }).error ?? undefined;
        const existingRetry = res.headers.get("retry-after");
        const hasValidRetry =
            !!existingRetry && /^\d+$/.test(existingRetry);

        // Thrown downstream error (c.error set): status/message come from
        // the error itself; existing integer Retry-After is preserved.
        if (thrown !== undefined) {
            const { status, body } = toAnthropicErrorBody(thrown);
            const headers = new Headers(res.headers);
            headers.set("content-type", "application/json; charset=utf-8");
            if (status === 429) {
                headers.set(
                    "retry-after",
                    hasValidRetry
                        ? (existingRetry as string)
                        : anthropicRetryAfter(thrown),
                );
            }
            c.res = new Response(JSON.stringify(body), {
                status,
                headers,
            });
            return;
        }

        // Returned (non-thrown) error response: normalize to Anthropic shape.
        const contentType = res.headers.get("content-type") ?? "";
        let parsed: unknown;
        if (contentType.includes("application/json")) {
            try {
                parsed = JSON.parse(await res.clone().text());
            } catch {
                parsed = undefined;
            }
            if (
                parsed &&
                typeof parsed === "object" &&
                (parsed as { type?: unknown }).type === "error" &&
                "error" in parsed
            ) {
                if (
                    res.status === 429 &&
                    !hasValidRetry
                ) {
                    const headers = new Headers(res.headers);
                    headers.set("content-type", "application/json; charset=utf-8");
                    headers.set("retry-after", "60");
                    c.res = new Response(await res.clone().text(), {
                        status: res.status,
                        headers,
                    });
                }
                return;
            }
            const { body } = toAnthropicErrorBody({
                status: res.status,
                message: extractReturnedMessage(parsed),
            });
            const headers = new Headers(res.headers);
            headers.set("content-type", "application/json; charset=utf-8");
            if (
                res.status === 429 &&
                !hasValidRetry
            ) {
                headers.set("retry-after", "60");
            }
            c.res = new Response(JSON.stringify(body), {
                status: res.status,
                headers,
            });
            return;
        }

        // Non-JSON returned error (e.g. text/plain): extract text message.
        let textMessage: string | undefined;
        try {
            const text = await res.clone().text();
            textMessage = text || undefined;
        } catch {
            textMessage = undefined;
        }
        const { body } = toAnthropicErrorBody({
            status: res.status,
            message: textMessage,
        });
        const headers = new Headers(res.headers);
        headers.set("content-type", "application/json; charset=utf-8");
        if (res.status === 429 && !hasValidRetry) {
            headers.set("retry-after", "60");
        }
        c.res = new Response(JSON.stringify(body), {
            status: res.status,
            headers,
        });
    },
);

/** Anthropic error envelope body for a known message (e.g. balance 402s). */
export function messagesErrorBody(
    message: string,
    type = "billing_error",
): MessagesError {
    return { type: "error", error: { type, message } };
}

/** A standalone Anthropic `error` SSE event carrying a known message. */
export function messagesErrorEventText(
    message: string,
    type = "billing_error",
): string {
    return `event: error\ndata: ${JSON.stringify(messagesErrorBody(message, type))}\n\n`;
}
