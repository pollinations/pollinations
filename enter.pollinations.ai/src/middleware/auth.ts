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
}

/** Extracts Bearer token from Authorization header (RFC 6750) or query parameter */
function extractApiKey(c: Context<AuthEnv>): string | null {
    const auth = c.req.header("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];

    return c.req.query("key") || null;
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

        const { user, session, apiKey } =
            (await authenticateSession()) || (await authenticateApiKey()) || {};

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
