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

    // Helper function for routes that need to check if anonymous usage is allowed
    // User is always present at this point since we already validated above
    const requireAuthorization = async (options?: {
        allowAnonymous?: boolean;
        message?: string;
    }): Promise<void> => {
        // User exists, so authorization succeeds unless specific check needed
        // This is mainly for future extensibility
        if (!options?.allowAnonymous) {
            // Already authenticated, nothing more to check
            return;
        }
    };

    // Set auth context with proper typing
    c.set("auth", {
        user: result.user,
        apiKey: result.apiKey,
        requireAuthorization,
    });

    c.get("log")?.debug("[GEN_AUTH] Authentication successful: {userId}", {
        userId: result.user.id,
    });

    await next();
});
