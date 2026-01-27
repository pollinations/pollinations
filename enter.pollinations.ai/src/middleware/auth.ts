import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Session, User } from "@/auth.ts";
import * as schema from "@/db/schema/better-auth.ts";
import { createAuth } from "../auth.ts";
import type { LoggerVariables } from "./logger.ts";
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
        /** Throws 402 if the API key has a budget set and remaining <= 0. */
        requireKeyBudget: () => void;
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
    /** The raw API key value (for passthrough to community models) */
    rawKey?: string;
};

type AuthResult = {
    user?: User;
    session?: Session;
    apiKey?: ApiKey;
    /** The raw API key value extracted from request (for passthrough) */
    rawApiKey?: string;
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
        const client = createAuth(c.env, c.executionCtx);

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
            const rawApiKey = extractApiKey(c);
            log.debug("Extracted API key: {hasKey}", {
                hasKey: !!rawApiKey,
                keyPrefix: rawApiKey?.substring(0, 8),
            });
            if (!rawApiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: rawApiKey,
                },
            });
            log.debug("API key verification result: {valid}", {
                valid: keyResult.valid,
            });
            if (!keyResult.valid || !keyResult.key) {
                // Check for rate limit error (better-auth bug: returns 401 instead of 429)
                if (keyResult.error?.code === "RATE_LIMITED") {
                    throw new HTTPException(429, {
                        message: "Rate limit exceeded. Please try again later.",
                    });
                }
                // API key was provided but is invalid - throw specific error
                throw new HTTPException(401, {
                    message:
                        "Invalid API key. Please check your key and try again.",
                });
            }
            const db = drizzle(c.env.DB, { schema });

            // Use permissions from verifyApiKey (set via createApiKey)
            // No fallback - permissions must be set at key creation time
            // Format: { models?: string[], account?: string[] }
            const permissions = keyResult.key.permissions as
                | { models?: string[]; account?: string[] }
                | undefined;

            // Fetch API key with user in single query using relation
            const fullApiKey = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, keyResult.key.id),
                with: { user: true },
            });

            log.debug("API key lookup result: {found}", {
                found: !!fullApiKey,
                userId: fullApiKey?.user?.id,
            });

            // CRITICAL: Reject if API key exists but has no associated user
            // This would cause billing to silently skip balance deduction (infinite pollen bug)
            // Use 402 because this is a billing issue - key is valid but we can't bill
            if (!fullApiKey?.user) {
                log.error(
                    "AUTH_NO_USER: API key {keyId} has no associated user - rejecting request",
                    { keyId: keyResult.key.id },
                );
                throw new HTTPException(402, {
                    message:
                        "API key is not associated with a valid user. Please regenerate your API key.",
                });
            }

            return {
                user: fullApiKey.user as User,
                apiKey: {
                    id: keyResult.key.id,
                    name: keyResult.key.name || undefined,
                    permissions,
                    metadata: keyResult.key.metadata || undefined,
                    pollenBalance: fullApiKey?.pollenBalance ?? null,
                    rawKey: rawApiKey,
                },
                rawApiKey,
            };
        };

        // Try session authentication first, then API key
        let authResult = await authenticateSession();
        if (!authResult) {
            authResult = await authenticateApiKey();
        }
        const { user, session, apiKey } = authResult || {};

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

            // Allowlist stores canonical model IDs (e.g., "flux-pro-1.1")
            // User may request via alias (e.g., "flux") which resolves to canonical ID
            // Check if the resolved canonical ID is in the allowlist
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

        const requireKeyBudget = (): void => {
            // No API key (session auth) = no budget check
            if (!apiKey) return;

            // Get pollenBalance from D1 column
            const pollenBalance = apiKey.pollenBalance;

            // No budget set = unlimited
            if (pollenBalance == null) return;

            // Budget exhausted
            if (pollenBalance <= 0) {
                log.debug(
                    "API key budget exhausted: {keyId} pollenBalance={pollenBalance}",
                    {
                        keyId: apiKey.id,
                        pollenBalance,
                    },
                );
                throw new HTTPException(402, {
                    message:
                        "API key budget exhausted. Please top up or create a new key.",
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
            requireKeyBudget,
        });

        await next();
    });
