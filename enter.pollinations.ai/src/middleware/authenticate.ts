import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { verifyApiKeyAndGetUser, extractApiKey } from "../auth/api-key.ts";
import { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";
import type { Session } from "@/auth.ts";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        session?: Session["session"];
        user?: Session["user"];
        requireActiveSession: (message?: string) => {
            user: Session["user"];
            session?: Session["session"];
        };
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

/**
 * Unified authentication middleware.
 * Tries session first (cookies), then API key (Bearer token).
 * Use for all routes - authentication is optional by default.
 * Call c.get("auth").requireActiveSession() to enforce authentication.
 */
export const authenticate = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);
    let user: Session["user"] | undefined;
    let session: Session["session"] | undefined;

    // Try session authentication (cookies)
    const sessionResult = await client.api.getSession({
        headers: c.req.raw.headers,
    });

    if (sessionResult?.user) {
        user = sessionResult.user;
        session = sessionResult.session;
    } else {
        // Try API key authentication (Bearer token)
        const authHeader = c.req.header("authorization");
        const apiKey = extractApiKey(authHeader);

        if (apiKey) {
            const result = await verifyApiKeyAndGetUser(client, c.env, apiKey);
            if (result.valid) {
                user = result.user;
            }
        }
    }

    const requireActiveSession = (message?: string) => {
        if (!user) {
            throw new HTTPException(401, {
                message:
                    message ||
                    "Authentication required. Sign in or provide a valid API key.",
            });
        }
        return { user, session: session ?? undefined };
    };

    c.set("auth", {
        client,
        session,
        user,
        requireActiveSession,
    });

    await next();
});

/**
 * Alias for dashboard routes that require session-based authentication.
 * Same as authenticate() but with clearer naming for session-required routes.
 */
export const authenticateSession = authenticate;

/**
 * Alias for API routes that support both session and API key authentication.
 * Same as authenticate() but with clearer naming for API routes.
 */
export const authenticateAPI = authenticate;

