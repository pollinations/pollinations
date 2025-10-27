import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";
import type { Session, User, Auth } from "@/auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema/better-auth.ts";

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

/** Extracts Bearer token from Authorization header (RFC 6750) or key query parameter */
function extractApiKey(headers: Headers, url?: URL): string | null {
    // First try Authorization header
    const auth = headers.get("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];

    // Fallback to key query parameter
    if (url) {
        const keyParam = url.searchParams.get("key");
        if (keyParam) {
            // Only allow publishable keys (pk_*) in query parameters for security
            if (!keyParam.startsWith("pk_")) {
                throw new HTTPException(400, {
                    message: "Only publishable keys (pk_*) allowed in query params. Use Authorization header for secret keys."
                });
            }
            return keyParam;
        }
    }

    return null;
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
            const url = new URL(c.req.url);
            const apiKey = extractApiKey(c.req.raw.headers, url);
            if (!apiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: apiKey,
                },
            });
            if (!keyResult.valid || !keyResult.key) return null;
            const db = drizzle(c.env.DB, { schema });
            const user = await db.query.user.findFirst({
                where: eq(schema.user.id, keyResult.key.userId),
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

        const requireAuthorization = async (options?: {
            allowAnonymous?: boolean;
            message?: string;
        }): Promise<void> => {
            if (!user && !options?.allowAnonymous) {
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
