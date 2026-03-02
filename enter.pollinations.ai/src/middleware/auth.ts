import { verifyAccessToken } from "better-auth/oauth2";
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
        oauthScopes?: string[];
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
        requireUser: () => User;
        /** Throws 403 if the API key doesn't have access to the resolved model from c.var.model. */
        requireModelAccess: () => void;
        /** Throws 402 if the API key has a budget set and remaining <= 0. */
        requireKeyBudget: () => void;
        /** Throws 403 if the OAuth token doesn't have the required scope. No-op for API key auth. */
        requireScope: (scope: string) => void;
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

interface ApiKey {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    pollenBalance?: number | null;
    rawKey?: string;
}

interface AuthResult {
    user?: User;
    session?: Session;
    apiKey?: ApiKey;
    rawApiKey?: string;
    oauthScopes?: string[];
}

/** Extracts Bearer token from Authorization header (RFC 6750) */
function extractBearerToken(c: Context<AuthEnv>): string | null {
    const auth = c.req.header("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    return match?.[1] || null;
}

/** Returns true if the token looks like a Pollinations API key (pk_ or sk_ prefix) */
function isApiKeyToken(token: string): boolean {
    return token.startsWith("pk_") || token.startsWith("sk_");
}

/** Extracts an API key from Bearer header or query parameter, skipping OAuth JWT tokens */
function extractApiKey(c: Context<AuthEnv>): string | null {
    const bearer = extractBearerToken(c);
    if (bearer && isApiKeyToken(bearer)) return bearer;
    // Only use query param for API keys (not OAuth tokens)
    if (!bearer) return c.req.query("key") || null;
    return null;
}

export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const _log = c.get("log").getChild("auth");
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
            const rawApiKey = extractApiKey(c);
            if (!rawApiKey) return null;

            const keyResult = await client.api.verifyApiKey({
                body: { key: rawApiKey },
            });

            if (!keyResult.valid || !keyResult.key) return null;

            const db = drizzle(c.env.DB, { schema });
            const permissions = keyResult.key.permissions as
                | { models?: string[]; account?: string[] }
                | undefined;

            const apiKeyData = await db
                .select()
                .from(schema.apikey)
                .where(eq(schema.apikey.id, keyResult.key.id))
                .get();

            const userData = apiKeyData
                ? await db
                      .select()
                      .from(schema.user)
                      .where(eq(schema.user.id, apiKeyData.userId))
                      .get()
                : null;

            const fullApiKey = apiKeyData
                ? { ...apiKeyData, user: userData }
                : null;

            // Check if key has expired
            if (fullApiKey?.expiresAt) {
                const expiryDate = new Date(fullApiKey.expiresAt);
                if (expiryDate < new Date()) {
                    return null;
                }
            }

            // Check if the key is disabled
            if (fullApiKey?.enabled === false) {
                return null;
            }

            return {
                user: fullApiKey?.user as User,
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

        const authenticateOAuthToken = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const bearer = extractBearerToken(c);
            // Only try OAuth JWT for non-API-key tokens
            if (!bearer || isApiKeyToken(bearer)) return null;

            try {
                const payload = await verifyAccessToken(bearer, {
                    verifyOptions: {
                        issuer:
                            new URL("/api/auth", c.req.url).origin +
                            "/api/auth",
                        audience: [
                            "https://gen.pollinations.ai",
                            "https://enter.pollinations.ai",
                        ],
                    },
                });

                if (!payload?.sub) return null;

                const db = drizzle(c.env.DB, { schema });
                const userData = await db
                    .select()
                    .from(schema.user)
                    .where(eq(schema.user.id, payload.sub))
                    .get();

                if (!userData) return null;

                const scopes =
                    typeof payload.scope === "string"
                        ? payload.scope.split(" ").filter(Boolean)
                        : [];

                return {
                    user: userData as User,
                    oauthScopes: scopes,
                };
            } catch {
                return null;
            }
        };

        // Try session authentication first, then OAuth JWT, then API key
        let authResult = await authenticateSession();
        if (!authResult) {
            authResult = await authenticateOAuthToken();
        }
        if (!authResult) {
            authResult = await authenticateApiKey();
        }
        const { user, session, apiKey, oauthScopes } = authResult || {};

        const requireAuthorization = async (options?: {
            message?: string;
        }): Promise<void> => {
            if (!user) {
                throw new HTTPException(401, {
                    message: options?.message,
                });
            }
        };

        const requireUser = (): User => {
            if (!user) throw new HTTPException(401);
            return user;
        };

        function requireModelAccess(): void {
            if (!apiKey || !apiKey.permissions?.models) return;

            const model = c.var.model;
            if (!model) return;

            if (!apiKey.permissions.models.includes(model.resolved)) {
                throw new HTTPException(403, {
                    message: `Model '${model.requested}' is not allowed for this API key`,
                });
            }
        }

        function requireKeyBudget(): void {
            if (!apiKey) return;

            const { pollenBalance } = apiKey;
            if (pollenBalance === null || pollenBalance === undefined) return;

            if (pollenBalance <= 0) {
                throw new HTTPException(402, {
                    message:
                        "API key budget exhausted. Please top up or create a new key.",
                });
            }
        }

        function requireScope(scope: string): void {
            // Only enforce scopes for OAuth token auth (API keys have no scope restrictions)
            if (!oauthScopes) return;
            if (!oauthScopes.includes(scope)) {
                throw new HTTPException(403, {
                    message: `Missing required scope: ${scope}`,
                });
            }
        }

        c.set("auth", {
            client,
            user,
            session,
            apiKey,
            oauthScopes,
            requireAuthorization,
            requireUser,
            requireModelAccess,
            requireKeyBudget,
            requireScope,
        });

        await next();
    });
