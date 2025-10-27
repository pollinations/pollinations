import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env, User } from "../env";
import { extractApiKey } from "@shared/proxy-headers";
import { validateApiKey } from "@shared/db/auth";

export const auth = createMiddleware<Env>(async (c, next) => {
    const apiKey = extractApiKey(c.req.raw.headers);

    if (!apiKey) {
        await next();
        return;
    }

    // Validate API key using shared utility
    const result = await validateApiKey(c.env.DB, apiKey);

    if (!result.valid || !result.user) {
        await next();
        return;
    }

    // Set user context
    const user: User = {
        id: result.user.id,
        githubId: result.user.githubId,
        tier: result.user.tier,
    };

    c.set("user", user);
    c.set("userTier", user.tier);

    await next();
});

export const requireAuth = createMiddleware<Env>(async (c, next) => {
    if (!c.var.user) {
        throw new HTTPException(401, {
            message: "Authentication required. Include API key in Authorization header.",
        });
    }
    await next();
});
