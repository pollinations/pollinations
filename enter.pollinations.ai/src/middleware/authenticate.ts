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
 * Session-only authentication for dashboard routes.
 * Only checks session cookies.
 */
export const authenticateSession = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);
    const result = await client.api.getSession({
        headers: c.req.raw.headers,
    });

    const requireActiveSession = (message?: string) => {
        if (!result?.user || !result?.session) {
            throw new HTTPException(401, {
                message: message || "You need to be signed-in to access this route.",
            });
        }
        return { user: result.user, session: result.session };
    };

    c.set("auth", {
        client,
        session: result?.session,
        user: result?.user,
        requireActiveSession,
    });

    await next();
});

/**
 * API authentication for API routes.
 * Checks session first, then API key.
 */
export const authenticateAPI = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);
    
    // Try session first
    const sessionResult = await client.api.getSession({
        headers: c.req.raw.headers,
    });

    let user = sessionResult?.user;
    let session = sessionResult?.session;

    // Try API key if no session
    if (!user) {
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
                message: message || "Authentication required. Sign in or provide a valid API key.",
            });
        }
        return { user, session };
    };

    c.set("auth", {
        client,
        session,
        user,
        requireActiveSession,
    });

    await next();
});

