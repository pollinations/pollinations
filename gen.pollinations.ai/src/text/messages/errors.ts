import { getDefaultErrorMessage } from "@shared/error.ts";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";

const ERROR_TYPES: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    402: "billing_error",
    403: "permission_error",
    404: "not_found_error",
    413: "request_too_large",
    429: "rate_limit_error",
    503: "overloaded_error",
    504: "timeout_error",
};

type ErrorBody = {
    error?: {
        message?: string;
        details?: {
            formErrors?: string[];
            fieldErrors?: Record<string, string[]>;
        };
    };
};

/**
 * Re-shape every failure on this route, from validation to auth to billing,
 * into Anthropic's error envelope so SDK retries and Claude Code's error
 * handling recognize it. The status code and message stay as they were.
 */
export const anthropicErrors = createMiddleware<Env>(async (c, next) => {
    await next();
    if (c.res.ok) return;
    const { status } = c.res;
    const body = (await c.res
        .clone()
        .json()
        .catch(() => ({}))) as ErrorBody;
    const { message, details } = body.error ?? {};
    const problems = [
        ...(details?.formErrors ?? []),
        ...Object.entries(details?.fieldErrors ?? {}).map(
            ([field, errors]) => `${field}: ${errors.join(", ")}`,
        ),
    ];
    // Hono keeps the old headers (retry-after included) on a replaced response.
    c.res.headers.delete("content-length");
    // The edge limiter is per-IP over a 10 second window and sets no header.
    if (status === 429 && !c.res.headers.has("retry-after")) {
        c.res.headers.set("retry-after", "10");
    }
    c.res = Response.json(
        {
            type: "error",
            error: {
                type:
                    ERROR_TYPES[status] ??
                    (status < 500 ? "invalid_request_error" : "api_error"),
                message: [
                    message ?? getDefaultErrorMessage(status),
                    ...problems,
                ].join("; "),
            },
            request_id: c.get("requestId"),
        },
        { status },
    );
});
