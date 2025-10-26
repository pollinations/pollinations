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
        requireAuth: (message?: string) => {
            user: Session["user"];
            session?: Session["session"];
        };
        requireActiveSession: (message?: string) => Session;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

/**
 * Session authentication for dashboard routes.
 * Only checks session cookies.
 */
export const authenticateSession = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);
    const result = await client.api.getSession({
        headers: c.req.raw.headers,
    });

    const requireAuth = (message?: string) => {
        if (!result?.user || !result?.session) {
            throw new HTTPException(401, {
                message: message || "You need to be signed-in to access this route.",
            });
        }
        return { user: result.user, session: result.session };
    };

    const requireActiveSession = (message?: string): Session => {
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
        requireAuth,
        requireActiveSession,
    });

    await next();
});

/**
 * API key authentication for API routes.
 * Checks Bearer token.
 */
export const authenticateAPI = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);
    const authHeader = c.req.header("authorization");
    const apiKey = extractApiKey(authHeader);

    let user: Session["user"] | undefined;

    if (apiKey) {
        const result = await verifyApiKeyAndGetUser(client, c.env, apiKey);
        if (result.valid) {
            user = result.user;
        }
    }

    const requireAuth = (message?: string) => {
        if (!user) {
            throw new HTTPException(401, {
                message: message || "Authentication required. Provide a valid API key.",
            });
        }
        return { user, session: undefined };
    };

    const requireActiveSession = (message?: string): Session => {
        throw new HTTPException(401, {
            message: message || "Session authentication not supported for API routes.",
        });
    };

    c.set("auth", {
        client,
        session: undefined,
        user,
        requireAuth,
        requireActiveSession,
    });

    await next();
});

