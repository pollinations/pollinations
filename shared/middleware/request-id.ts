import type { MiddlewareHandler } from "hono";
import type { RequestIdVariables } from "hono/request-id";

const HEADER_NAME = "X-Request-Id";

/**
 * Mints a fresh request id server-side on every request. Unlike hono's
 * `requestId()`, this never trusts an inbound `X-Request-Id` header — a
 * client-supplied id let callers pin/replay ids (see #12889), corrupting
 * anything keyed on request_id (e.g. S3 output paths, fallback-attempt
 * grouping). The response header is still set so callers can read the id.
 */
export const requestId = (): MiddlewareHandler<{
    Variables: RequestIdVariables;
}> => {
    return async (c, next) => {
        const id = crypto.randomUUID();
        c.set("requestId", id);
        c.header(HEADER_NAME, id);
        await next();
    };
};
