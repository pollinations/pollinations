// Shared error-response helpers for catgpt surfaces.
//
// All catgpt surfaces (openai-compat, web-chat, a2a) call the same upstream
// model provider via `generateCatReplyWithUsage`, so they all face the same
// translation problem when upstream returns non-2xx. Centralizing the
// translation here keeps the codes/hints consistent across surfaces and
// stops three copies from drifting.
//
// Friction-research B5 contract: never leak stack traces; always
// {error: {code, message, hint}} where hint is a copyable next step.
//
// The 429 path forwards upstream `Retry-After` verbatim — both as a
// response header (for clients that auto-retry) and embedded in the hint
// (for humans). Lifted from codex's `4d3c9dec` (#10636).

import type { UpstreamError } from "./reply.ts";

export function errorResponse(
    status: number,
    code: string,
    message: string,
    hint: string,
    extraHeaders: Record<string, string> = {},
): Response {
    return Response.json(
        { error: { code, message, hint } },
        { status, headers: extraHeaders },
    );
}

export function upstreamErrorResponse(err: UpstreamError): Response {
    if (err.status === 401 || err.status === 403) {
        return errorResponse(
            err.status,
            "upstream_auth_failed",
            "model provider rejected the request's credentials",
            "set Authorization: Bearer <pk_*> with a valid key from https://enter.pollinations.ai",
        );
    }
    if (err.status === 402) {
        return errorResponse(
            402,
            "insufficient_pollen",
            "the configured key is out of pollen for this model",
            "top up at https://enter.pollinations.ai or use a key with a higher daily limit",
        );
    }
    if (err.status === 429) {
        const headers = err.retryAfter ? { "Retry-After": err.retryAfter } : {};
        const hint = err.retryAfter
            ? `back off and retry; upstream said Retry-After: ${err.retryAfter}`
            : "back off and retry; the response Retry-After header (if present) is the upstream guidance";
        return errorResponse(
            429,
            "upstream_rate_limited",
            "model provider is rate-limiting this key",
            hint,
            headers,
        );
    }
    if (err.status >= 500) {
        return errorResponse(
            502,
            "upstream_error",
            `model provider returned ${err.status}`,
            "retry in a few seconds; if it persists report at https://github.com/pollinations/pollinations/issues",
        );
    }
    // Anything else upstream-side: surface verbatim with the body as the hint.
    return errorResponse(
        err.status,
        "upstream_error",
        `model provider returned ${err.status}`,
        err.body || "see upstream response for details",
    );
}

export function unavailableResponse(): Response {
    return errorResponse(
        502,
        "upstream_unavailable",
        "could not reach the upstream model provider",
        "retry in a few seconds; if it persists check https://gen.pollinations.ai/docs",
    );
}
