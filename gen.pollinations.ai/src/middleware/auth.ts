/**
 * Auth middleware - simplified API key validation
 * Logic copied from enter.pollinations.ai to avoid cross-package import issues
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env, User } from "../env";

/** Extracts Bearer token from Authorization header (RFC 6750) */
function extractApiKey(headers: Headers): string | null {
    const auth = headers.get("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    return match?.[1] || null;
}

export const auth = createMiddleware<Env>(async (c, next) => {
    const apiKey = extractApiKey(c.req.raw.headers);

    if (!apiKey) {
        await next();
        return;
    }

    // Simple SQL query to validate API key (same logic as enter's Better Auth)
    const result = await c.env.DB.prepare(`
        SELECT 
            u.id as userId,
            u.github_id as githubId,
            u.tier as tier,
            k.expires_at as expiresAt
        FROM apikey k
        INNER JOIN user u ON k.user_id = u.id
        WHERE k.key = ? AND k.enabled = 1
        LIMIT 1
    `).bind(apiKey).first();

    if (!result) {
        await next();
        return;
    }

    // Check if key is expired
    if (result.expiresAt && new Date(result.expiresAt as number) < new Date()) {
        await next();
        return;
    }

    // Set user context
    const user: User = {
        id: result.userId as string,
        githubId: result.githubId as number,
        tier: result.tier as string,
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
