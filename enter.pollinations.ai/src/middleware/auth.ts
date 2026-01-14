import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import type { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";
import type { Session, User } from "@/auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema/better-auth.ts";
import type { Context } from "hono";
import type { ModelVariables } from "./model.ts";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        user?: User;
        session?: Session;
        apiKey?: ApiKey;
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
        requireUser: () => User;
        /** Throws 403 if the API key doesn't have access to the resolved model from c.var.model. */
        requireModelAccess: () => void;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

export type AuthOptions = {
    allowSessionCookie: boolean;
    allowApiKey: boolean;
};

type ApiKey = {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    pollenBalance?: number | null;
    pollenRefillRate?: number | null;
    pollenMaxBalance?: number | null;
    lastPollenRefillAt?: Date | null;
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
        const log = c.get("log").getChild("auth");
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

        const authenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const apiKey = extractApiKey(c);
            log.debug("Extracted API key: {hasKey}", {
                hasKey: !!apiKey,
                keyPrefix: apiKey?.substring(0, 8),
            });
            if (!apiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: apiKey,
                },
            });
            log.debug("API key verification result: {valid}", {
                valid: keyResult.valid,
            });
            if (!keyResult.valid || !keyResult.key) return null;
            const db = drizzle(c.env.DB, { schema });

            // Use permissions from verifyApiKey (set via createApiKey)
            // No fallback - permissions must be set at key creation time
            const permissions = keyResult.key.permissions as
                | { models?: string[] }
                | undefined;

            // Fetch user
            const user = await db.query.user.findFirst({
                where: eq(schema.user.id, keyResult.key.userId),
            });

            // Fetch full API key with budget fields
            const fullApiKey = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, keyResult.key.id),
            });

            log.debug("User lookup result: {found}", {
                found: !!user,
                userId: user?.id,
            });

            return {
                user: user as User,
                apiKey: {
                    id: keyResult.key.id,
                    name: keyResult.key.name || undefined,
                    permissions,
                    metadata: keyResult.key.metadata || undefined,
                    pollenBalance: fullApiKey?.pollenBalance ?? null,
                    pollenRefillRate: fullApiKey?.pollenRefillRate ?? null,
                    pollenMaxBalance: fullApiKey?.pollenMaxBalance ?? null,
                    lastPollenRefillAt: fullApiKey?.lastPollenRefillAt ?? null,
                },
            };
        };

        const { user, session, apiKey } =
            (await authenticateSession()) || (await authenticateApiKey()) || {};

        log.debug("Authentication result: {authenticated}", {
            authenticated: !!user,
            hasSession: !!session,
            hasApiKey: !!apiKey,
            userId: user?.id,
        });

        const requireAuthorization = async (options?: {
            message?: string;
        }): Promise<void> => {
            log.debug("Checking authorization: {hasUser}", {
                hasUser: !!user,
            });
            if (!user) {
                log.debug("Authorization failed: No user");
                throw new HTTPException(401, {
                    message: options?.message,
                });
            }
        };

        const requireUser = (): User => {
            if (!user) throw new HTTPException(401);
            return user;
        };

        const requireModelAccess = (): void => {
            // No API key (session auth) = allow all models
            if (!apiKey) return;
            // No permissions or no models restriction = allow all (backward compatible)
            if (!apiKey.permissions?.models) return;

            // Get resolved model from middleware (must run after resolveModel middleware)
            const model = c.var.model;
            if (!model) return; // No model middleware ran, skip check

            // Check if resolved model is in the allowlist
            if (!apiKey.permissions.models.includes(model.resolved)) {
                log.debug("Model access denied: {model} not in allowlist", {
                    model: model.requested,
                    resolved: model.resolved,
                    allowed: apiKey.permissions.models,
                });
                throw new HTTPException(403, {
                    message: `Model '${model.requested}' is not allowed for this API key`,
                });
            }
        };

        c.set("auth", {
            client,
            user,
            session,
            apiKey,
            requireAuthorization,
            requireUser,
            requireModelAccess,
        });

        await next();
    });
