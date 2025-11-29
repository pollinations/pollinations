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
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
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
    allowBearerSessionToken?: boolean; // RFC 8628 Device Flow support
    allowOAuthAccessToken?: boolean; // OAuth 2.0 access token support
};

type ApiKey = {
    id: string;
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
function extractBearerToken(c: Context<AuthEnv>): string | null {
    // Try Authorization header first (RFC 6750)
    const auth = c.req.header("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];

    // Fallback to query parameter for GET requests (browser-friendly)
    return c.req.query("key") || null;
}

export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const log = c.get("log");
        const client = createAuth(c.env);

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

        /**
         * Authenticate via Bearer session token (RFC 8628 Device Flow)
         * This validates session tokens passed as Bearer tokens, supporting CLI/API clients
         */
        const authenticateBearerSessionToken =
            async (): Promise<AuthResult | null> => {
                if (!options.allowBearerSessionToken) return null;
                const token = extractBearerToken(c);
                if (!token) return null;

                // Skip if it looks like an API key (pk_ or sk_ prefix)
                if (token.startsWith("pk_") || token.startsWith("sk_"))
                    return null;

                log.debug("[AUTH] Checking Bearer session token: {hasToken}", {
                    hasToken: !!token,
                    tokenPrefix: token?.substring(0, 8),
                });

                const db = drizzle(c.env.DB, { schema });
                const sessionRecord = await db.query.session.findFirst({
                    where: eq(schema.session.token, token),
                });

                if (!sessionRecord) {
                    log.debug("[AUTH] Session token not found");
                    return null;
                }

                if (sessionRecord.expiresAt < new Date()) {
                    log.debug("[AUTH] Session token expired");
                    return null;
                }

                const user = await db.query.user.findFirst({
                    where: eq(schema.user.id, sessionRecord.userId),
                });

                log.debug("[AUTH] Bearer session token validated: {found}", {
                    found: !!user,
                    userId: user?.id,
                });

                return {
                    user: user as User,
                    session: sessionRecord as Session,
                };
            };

        /**
         * Authenticate via OAuth 2.0 access token
         * This allows OAuth clients to use their access_token directly for API calls
         */
        const authenticateOAuthAccessToken =
            async (): Promise<AuthResult | null> => {
                if (!options.allowOAuthAccessToken) return null;
                const token = extractBearerToken(c);
                if (!token) return null;

                // Skip if it looks like an API key (pk_ or sk_ prefix)
                if (token.startsWith("pk_") || token.startsWith("sk_"))
                    return null;

                log.debug("[AUTH] Checking OAuth access token: {hasToken}", {
                    hasToken: !!token,
                    tokenPrefix: token?.substring(0, 8),
                });

                const db = drizzle(c.env.DB, { schema });
                const oauthToken = await db.query.oauthAccessToken.findFirst({
                    where: eq(schema.oauthAccessToken.accessToken, token),
                });

                if (!oauthToken) {
                    log.debug("[AUTH] OAuth access token not found");
                    return null;
                }

                if (oauthToken.accessTokenExpiresAt < new Date()) {
                    log.debug("[AUTH] OAuth access token expired");
                    return null;
                }

                const user = await db.query.user.findFirst({
                    where: eq(schema.user.id, oauthToken.userId),
                });

                log.debug("[AUTH] OAuth access token validated: {found}", {
                    found: !!user,
                    userId: user?.id,
                });

                return {
                    user: user as User,
                };
            };

        const authenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const apiKey = extractBearerToken(c);
            log.debug("[AUTH] Extracted API key: {hasKey}", {
                hasKey: !!apiKey,
                keyPrefix: apiKey?.substring(0, 8),
            });
            if (!apiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: apiKey,
                },
            });
            log.debug("[AUTH] API key verification result: {valid}", {
                valid: keyResult.valid,
            });
            if (!keyResult.valid || !keyResult.key) return null;
            const db = drizzle(c.env.DB, { schema });
            const user = await db.query.user.findFirst({
                where: eq(schema.user.id, keyResult.key.userId),
            });
            log.debug("[AUTH] User lookup result: {found}", {
                found: !!user,
                userId: user?.id,
            });
            return {
                user: user as User,
                apiKey: {
                    id: keyResult.key.id,
                    name: keyResult.key.name || undefined,
                    permissions: keyResult.key.permissions || undefined,
                    metadata: keyResult.key.metadata || undefined,
                },
            };
        };

        // Authentication priority:
        // 1. Bearer session token (RFC 8628 Device Flow - CLI/API clients)
        // 2. OAuth access token (OAuth 2.0 clients)
        // 3. Session cookie (browser clients)
        // 4. API key (programmatic access)
        const { user, session, apiKey } =
            (await authenticateBearerSessionToken()) ||
            (await authenticateOAuthAccessToken()) ||
            (await authenticateSession()) ||
            (await authenticateApiKey()) ||
            {};

        log.debug("[AUTH] Authentication result: {authenticated}", {
            authenticated: !!user,
            hasSession: !!session,
            hasApiKey: !!apiKey,
            userId: user?.id,
        });

        const requireAuthorization = async (options?: {
            message?: string;
        }): Promise<void> => {
            log.debug("[AUTH] Checking authorization: {hasUser}", {
                hasUser: !!user,
            });
            if (!user) {
                log.debug("[AUTH] Authorization failed: No user");
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
