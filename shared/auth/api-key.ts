import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import * as schema from "../db/better-auth.ts";
import { PUBLISHABLE_API_KEY_PREFIX } from "./api-key-metadata.ts";

export type AuthUser = typeof schema.user.$inferSelect;

export interface AuthenticatedApiKey {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    pollenBalance?: number | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
    rawKey?: string;
}

export interface ApiKeyAuthResult {
    user?: AuthUser;
    apiKey: AuthenticatedApiKey;
    rawApiKey: string;
}

export interface ApiKeyAuthBindings {
    DB: D1Database;
    ENVIRONMENT?: string;
    STAGING_ALLOWED_GITHUB_IDS?: string;
}

export class BannedAccountError extends Error {
    constructor(message = "Account banned") {
        super(message);
        this.name = "BannedAccountError";
    }
}

export class StagingAccessDeniedError extends Error {
    constructor() {
        super("staging is invite-only");
        this.name = "StagingAccessDeniedError";
    }
}

/**
 * Parse a comma-separated list of numeric GitHub user IDs.
 * Strict: only entries matching /^\d+$/ are kept (so "123abc" is dropped,
 * not silently truncated to 123).
 */
export function parseGithubIdList(raw: string | undefined | null): Set<number> {
    if (!raw) return new Set();
    const ids = new Set<number>();
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (!/^\d+$/.test(trimmed)) continue;
        const n = Number(trimmed);
        if (n > 0) ids.add(n);
    }
    return ids;
}

/**
 * Throws StagingAccessDeniedError if the env is staging and the user's
 * GitHub ID is not in STAGING_ALLOWED_GITHUB_IDS. No-op outside staging.
 * Fails closed: a missing githubId or empty/missing allowlist denies access.
 *
 * Called at request-time (every API-key or session-cookie request) to defend
 * against pre-existing sessions/keys that predate the lockdown. See #11137.
 */
export function assertStagingAccess(
    env: { ENVIRONMENT?: string; STAGING_ALLOWED_GITHUB_IDS?: string },
    user: { githubId?: number | null } | null | undefined,
): void {
    if (env.ENVIRONMENT !== "staging") return;
    const allowed = parseGithubIdList(env.STAGING_ALLOWED_GITHUB_IDS);
    const ghId = user?.githubId;
    if (!ghId || !allowed.has(Number(ghId))) {
        throw new StagingAccessDeniedError();
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
        defaultPrefix: PUBLISHABLE_API_KEY_PREFIX,
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
            const isPublishable = options.prefix === PUBLISHABLE_API_KEY_PREFIX;
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
    const byopClientKey = alias(schema.apikey, "byop_client_key");
    const [apiKeyExtra, userData] = await Promise.all([
        db
            .select({
                pollenBalance: schema.apikey.pollenBalance,
                byopClientKeyId: schema.apikey.byopClientKeyId,
                byopClientName: byopClientKey.name,
                byopClientUserId: byopClientKey.userId,
            })
            .from(schema.apikey)
            .leftJoin(
                byopClientKey,
                eq(byopClientKey.id, schema.apikey.byopClientKeyId),
            )
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
    assertStagingAccess(opts.env, userData);

    return {
        user: userData ?? undefined,
        apiKey: {
            id: keyId,
            name: typeof key.name === "string" ? key.name : undefined,
            permissions: normalizePermissions(key.permissions),
            metadata: normalizeMetadata(key.metadata),
            pollenBalance: apiKeyExtra?.pollenBalance ?? null,
            byopClientKeyId: apiKeyExtra?.byopClientKeyId ?? null,
            byopClientName: apiKeyExtra?.byopClientName ?? null,
            byopClientUserId: apiKeyExtra?.byopClientUserId ?? null,
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
