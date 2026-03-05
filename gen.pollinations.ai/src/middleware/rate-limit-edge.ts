/**
 * Edge rate limiter for gen.pollinations.ai
 * Copied from enter with Env type adapted.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

export const edgeRateLimit = createMiddleware<Env>(async (c, next) => {
    if (!c.env.EDGE_RATE_LIMITER) {
        return next();
    }
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.EDGE_RATE_LIMITER.limit({ key: ip });

    if (!success) {
        throw new HTTPException(429, {
            message: "Too many requests from this IP. Please slow down.",
        });
    }

    await next();
});
