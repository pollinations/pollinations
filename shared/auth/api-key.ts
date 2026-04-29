import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/better-auth.ts";

const PUBLISHABLE_KEY_PREFIX = "pk";

export type AuthUser = typeof schema.user.$inferSelect;

export interface AuthenticatedApiKey {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    pollenBalance?: number | null;
    rawKey?: string;
}

export interface ApiKeyAuthResult {
    user?: AuthUser;
    apiKey: AuthenticatedApiKey;
    rawApiKey: string;
}

export interface ApiKeyAuthBindings {
    DB: D1Database;
}

export class BannedAccountError extends Error {
    constructor(message = "Account banned") {
        super(message);
        this.name = "BannedAccountError";
    }
}

type VerifyApiKeyResponse = {
    valid: boolean;
    key?: {
        id?: unknown;
        name?: unknown;
        userId?: unknown;
        permissions?: unknown;
        metadata?: unknown;
    } | null;
};

export type VerifyApiKeyClient = {
    api: {
        verifyApiKey: (args: {
            body: { key: string };
        }) => Promise<VerifyApiKeyResponse>;
    };
};

export function createApiKeyPlugin() {
    return apiKey({
        enableMetadata: true,
        deferUpdates: true,
        defaultPrefix: PUBLISHABLE_KEY_PREFIX,
        defaultKeyLength: 16,
        minimumNameLength: 1,
        maximumNameLength: 253,
        startingCharactersConfig: {
            charactersLength: 10,
        },
        customKeyGenerator: (options: {
            length: number;
            prefix: string | undefined;
        }) => {
            const isPublishable = options.prefix === PUBLISHABLE_KEY_PREFIX;
            const keyLength = isPublishable ? 16 : 32;
            const chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            const randomBytes = crypto.getRandomValues(
                new Uint8Array(keyLength),
            );
            const key = Array.from(
                randomBytes,
                (byte) => chars[byte % chars.length],
            ).join("");
            return options.prefix ? `${options.prefix}_${key}` : key;
        },
        keyExpiration: {
            minExpiresIn: 0,
            maxExpiresIn: 365,
        },
        rateLimit: {
            enabled: false,
        },
    });
}

export function createApiKeyAuth(
    env: ApiKeyAuthBindings,
    ctx?: ExecutionContext,
) {
    const db = drizzle(env.DB);
    return betterAuth({
        basePath: "/api/auth",
        database: drizzleAdapter(db, {
            schema,
            provider: "sqlite",
        }),
        advanced: {
            backgroundTasks: ctx
                ? {
                      handler: (promise: Promise<unknown>) => {
                          ctx.waitUntil(promise.catch(() => undefined));
                      },
                  }
                : undefined,
        },
        plugins: [createApiKeyPlugin()],
        telemetry: { enabled: false },
    });
}

export function extractApiKey(request: Request): string | null {
    const auth = request.headers.get("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];

    return new URL(request.url).searchParams.get("key");
}

export function assertNotBanned(user: {
    banned?: boolean | null;
    banExpires?: Date | string | null;
    banReason?: string | null;
}): void {
    if (user.banned !== true) return;
    if (user.banExpires && new Date(user.banExpires) <= new Date()) return;
    throw new BannedAccountError(
        user.banReason ? `Account banned: ${user.banReason}` : "Account banned",
    );
}

export async function authenticateApiKeyRequest(opts: {
    request: Request;
    env: ApiKeyAuthBindings;
    client?: VerifyApiKeyClient;
    ctx?: ExecutionContext;
}): Promise<ApiKeyAuthResult | null> {
    const rawApiKey = extractApiKey(opts.request);
    if (!rawApiKey) return null;

    const client: VerifyApiKeyClient =
        opts.client ??
        (createApiKeyAuth(opts.env, opts.ctx) as unknown as VerifyApiKeyClient);
    const keyResult = await client.api.verifyApiKey({
        body: { key: rawApiKey },
    });

    if (!keyResult.valid || !keyResult.key) return null;

    const key = keyResult.key;
    const keyId = typeof key.id === "string" ? key.id : undefined;
    if (!keyId) return null;

    const db = drizzle(opts.env.DB, { schema });
    const userId = typeof key.userId === "string" ? key.userId : undefined;
    const [apiKeyExtra, userData] = await Promise.all([
        db
            .select({ pollenBalance: schema.apikey.pollenBalance })
            .from(schema.apikey)
            .where(eq(schema.apikey.id, keyId))
            .get(),
        userId
            ? db
                  .select()
                  .from(schema.user)
                  .where(eq(schema.user.id, userId))
                  .get()
            : null,
    ]);

    if (userData) {
        assertNotBanned(userData);
    }

    return {
        user: userData ?? undefined,
        apiKey: {
            id: keyId,
            name: typeof key.name === "string" ? key.name : undefined,
            permissions: normalizePermissions(key.permissions),
            metadata: normalizeMetadata(key.metadata),
            pollenBalance: apiKeyExtra?.pollenBalance ?? null,
            rawKey: rawApiKey,
        },
        rawApiKey,
    };
}

function normalizePermissions(
    value: unknown,
): Record<string, string[]> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const permissions: Record<string, string[]> = {};
    for (const [key, scopes] of Object.entries(value)) {
        if (!Array.isArray(scopes)) continue;
        const safeScopes = scopes.filter(
            (scope): scope is string => typeof scope === "string",
        );
        if (safeScopes.length) permissions[key] = safeScopes;
    }
    return Object.keys(permissions).length ? permissions : undefined;
}

function normalizeMetadata(
    value: unknown,
): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}
