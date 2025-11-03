import { createMiddleware } from "hono/factory";
import type { Env } from "../../../src/env.ts";
import { authenticateApiKey } from "../../../src/middleware/auth.ts";
import { HTTPException } from "hono/http-exception";

/**
 * Minimal auth middleware for gen.pollinations.ai
 * Only validates API keys - no session cookies, no user creation hooks, no polar integration
 * Reuses authenticateApiKey from parent auth middleware
 */
export const genAuth = createMiddleware<Env>(async (c, next) => {
    const result = await authenticateApiKey(c);
    
    if (!result?.user) {
        c.get("log")?.warn("[GEN_AUTH] Authentication failed");
        throw new HTTPException(401, {
            message: "API key required. Include your key in the Authorization header: Bearer YOUR_API_KEY",
        });
    }

    // Helper function for routes that need to check authorization
    const requireAuthorization = async (options?: {
        allowAnonymous?: boolean;
        message?: string;
    }): Promise<void> => {
        if (!result.user && !options?.allowAnonymous) {
            c.get("log")?.warn("[GEN_AUTH] Authorization failed: No user and anonymous not allowed");
            throw new HTTPException(401, {
                message: options?.message || "Authentication required",
            });
        }
    };

    // Set auth context (cast needed since Env doesn't define auth in Variables)
    (c as any).set("auth", {
        user: result.user,
        apiKey: result.apiKey,
        requireAuthorization,
    });

    c.get("log")?.debug("[GEN_AUTH] Authentication successful: {userId}", {
        userId: result.user.id,
    });

    await next();
});
