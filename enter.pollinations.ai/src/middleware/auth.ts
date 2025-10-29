import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";
import type { Session, User, Auth } from "@/auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema/better-auth.ts";
import type { Context } from "hono";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        user?: User;
        session?: Session;
        apiKey?: ApiKey;
        requireAuthorization: (options?: {
            allowAnonymous: boolean;
            message?: string;
        }) => Promise<void>;
        requireUser: () => User;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

export type AuthOptions = {
    allowSessionCookie: boolean;
    allowApiKey: boolean;
};

type ApiKey = {
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
};

type AuthResult = {
    user?: User;
    session?: Session;
    apiKey?: ApiKey;
};

/** Extracts Bearer token from Authorization header (RFC 6750) or query parameter */
function extractApiKey(c: Context<AuthEnv>): string | null {
    // Try Authorization header first (RFC 6750)
    const auth = c.req.header("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];
    
    // Fallback to query parameter for GET requests (browser-friendly)
    return c.req.query("key") || null;
}

export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const client = createAuth(c.env) as Auth;

        const authenticateSession = async (): Promise<AuthResult | null> => {
            if (!options.allowSessionCookie) return null;
            const result = await client.api.getSession({
                headers: c.req.raw.headers,
            });
            if (!result?.user) return null;
            return {
                user: result?.user,
                session: result?.session,
            };
        };

        const authenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const apiKey = extractApiKey(c);
            c.get("log")?.debug("[AUTH] Extracted API key: {hasKey}", {
                hasKey: !!apiKey,
                keyPrefix: apiKey?.substring(0, 8),
            });
            if (!apiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: apiKey,
                },
            });
            c.get("log")?.debug("[AUTH] API key verification result: {valid}", {
                valid: keyResult.valid,
            });
            if (!keyResult.valid || !keyResult.key) return null;
            const db = drizzle(c.env.DB, { schema });
            const user = await db.query.user.findFirst({
                where: eq(schema.user.id, keyResult.key.userId),
            });
            c.get("log")?.debug("[AUTH] User lookup result: {found}", {
                found: !!user,
                userId: user?.id,
            });
            return {
                user: user as User,
                apiKey: {
                    name: keyResult.key.name || undefined,
                    permissions: keyResult.key.permissions || undefined,
                    metadata: keyResult.key.metadata || undefined,
                },
            };
        };

        const { user, session, apiKey } =
            (await authenticateSession()) || (await authenticateApiKey()) || {};

        c.get("log")?.debug("[AUTH] Authentication result: {authenticated}", {
            authenticated: !!user,
            hasSession: !!session,
            hasApiKey: !!apiKey,
            userId: user?.id,
        });

        const requireAuthorization = async (options?: {
            allowAnonymous?: boolean;
            message?: string;
        }): Promise<void> => {
            c.get("log")?.debug(
                "[AUTH] Checking authorization: {hasUser}, {allowAnonymous}",
                {
                    hasUser: !!user,
                    allowAnonymous: options?.allowAnonymous,
                },
            );
            if (!user && !options?.allowAnonymous) {
                c.get("log")?.warn("[AUTH] Authorization failed: No user and anonymous not allowed");
                throw new HTTPException(401, {
                    message: options?.message,
                });
            }
        };

        const requireUser = (): User => {
            if (!user) throw new HTTPException(401);
            return user;
        };

        c.set("auth", {
            client,
            user,
            session,
            apiKey,
            requireAuthorization,
            requireUser,
        });

        await next();
    });
