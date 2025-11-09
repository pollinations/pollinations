/**
 * Simple API key authentication middleware (no session, no hooks)
 * 
 * Use this for API endpoints that only need API key auth without:
 * - Session cookie handling
 * - User creation/update hooks (Polar integration)
 * - GitHub OAuth flows
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "@/auth.ts";
import type { LoggerVariables } from "./logger.ts";
import type { User } from "@/auth.ts";
import {
    extractApiKey,
    authenticateApiKey,
    createRequireAuthorization,
    type ApiKey,
} from "./auth-utils.ts";

export type ApiKeyAuthVariables = {
    apiKeyAuth: {
        user: User;
        apiKey: ApiKey;
        requireAuthorization: (options?: {
            allowAnonymous?: boolean;
            message?: string;
        }) => Promise<void>;
    };
};

export type ApiKeyAuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & ApiKeyAuthVariables;
};

/**
 * API key authentication middleware
 * 
 * Extracts and verifies API key from Authorization header or ?key= parameter.
 * Does NOT handle sessions or trigger user creation/update hooks.
 */
export const apiKeyAuth = createMiddleware<ApiKeyAuthEnv>(async (c, next) => {
    const log = c.get("log");
    const client = createAuth(c.env);
    
    // Extract API key
    const apiKey = extractApiKey(c);
    if (!apiKey) {
        log.debug("[API_KEY_AUTH] No API key provided");
        throw new HTTPException(401, {
            message: "API key required. Include in Authorization header or ?key= parameter",
        });
    }
    
    // Authenticate using shared utility (no hooks)
    const result = await authenticateApiKey(client, apiKey, c.env, log);
    
    if (!result || !result.user || !result.apiKey) {
        log.debug("[API_KEY_AUTH] Authentication failed");
        throw new HTTPException(401, { message: "Invalid API key" });
    }
    
    log.debug("[API_KEY_AUTH] Authentication successful", {
        userId: result.user.id,
        tier: result.user.tier,
    });
    
    // Store in context
    c.set("apiKeyAuth", {
        user: result.user,
        apiKey: result.apiKey,
        requireAuthorization: createRequireAuthorization(result.user, log),
    });
    
    await next();
});
