import {
    getDefaultErrorMessage,
    handleError,
    UpstreamError,
} from "@shared/error.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";

type ErrorBody = {
    error?: { message?: unknown } | string;
    message?: unknown;
};

function errorType(status: number): string {
    if (status === 400 || status === 415 || status === 422) {
        return "invalid_request_error";
    }
    if (status === 401) return "authentication_error";
    if (status === 402) return "billing_error";
    if (status === 403) return "permission_error";
    if (status === 404) return "not_found_error";
    if (status === 413) return "request_too_large";
    if (status === 429) return "rate_limit_error";
    if (status === 529) return "overloaded_error";
    return "api_error";
}

async function responseMessage(response: Response): Promise<string> {
    let text = "";
    try {
        text = await response.clone().text();
    } catch {
        return getDefaultErrorMessage(response.status);
    }
    if (!text) return getDefaultErrorMessage(response.status);
    try {
        const body = JSON.parse(text) as ErrorBody;
        if (
            body.error &&
            typeof body.error === "object" &&
            typeof body.error.message === "string"
        ) {
            return body.error.message;
        }
        if (typeof body.message === "string") return body.message;
        if (typeof body.error === "string") return body.error;
    } catch {
        return text;
    }
    return getDefaultErrorMessage(response.status);
}

function integerRetryAfter(
    headers: Headers,
    upstreamHeaders?: Record<string, string>,
): string {
    const raw =
        headers.get("retry-after") ??
        upstreamHeaders?.["retry-after"] ??
        upstreamHeaders?.["Retry-After"];
    const seconds = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(seconds) && seconds >= 0
        ? String(Math.max(1, Math.ceil(seconds)))
        : "1";
}

export async function anthropicErrorResponse(
    c: Context<Env>,
    response: Response,
    statusOverride?: number,
    upstreamHeaders?: Record<string, string>,
): Promise<Response> {
    const status = statusOverride ?? response.status;
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    if (status === 429) {
        headers.set("Retry-After", integerRetryAfter(headers, upstreamHeaders));
    }
    const requestId = c.get("requestId");
    if (requestId) headers.set("request-id", requestId);

    return new Response(
        JSON.stringify({
            type: "error",
            error: {
                type: errorType(status),
                message: await responseMessage(response),
            },
            ...(requestId ? { request_id: requestId } : {}),
        }),
        { status, headers },
    );
}

export async function handleAnthropicMessagesError(
    error: Error,
    c: Context<Env>,
): Promise<Response> {
    const base = await handleError(error, c);
    const providerRateLimit =
        error instanceof UpstreamError && error.upstreamStatus === 429;
    return anthropicErrorResponse(
        c,
        base,
        providerRateLimit ? 429 : undefined,
        error instanceof UpstreamError ? error.upstreamHeaders : undefined,
    );
}

export const anthropicMessagesErrorBoundary = createMiddleware<Env>(
    async (c, next) => {
        await next();
        if (c.res.status >= 400) {
            c.res = await anthropicErrorResponse(c, c.res);
        }
    },
);
