import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import * as schema from "../db/better-auth.ts";
import {
    AGENT_RUN_TOKEN_PREFIX,
    type AgentRunClaims,
    verifyAgentRunToken,
} from "./agent-run-token.ts";
import { parseMetadata } from "./api-key-creation.ts";
import { parseGithubIdList } from "./github-id-list.ts";

const PUBLISHABLE_KEY_PREFIX = "pk";

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
    agentRun?: AgentRunClaims;
}

export interface ApiKeyAuthBindings {
    DB: D1Database;
    ENVIRONMENT?: string;
    STAGING_ALLOWED_GITHUB_IDS?: string;
    STAGING_ALLOWED_EMAILS?: string;
    BETTER_AUTH_SECRET?: string;
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
 * Throws StagingAccessDeniedError if the env is staging and the user is not in
 * either staging allowlist. No-op outside staging.
 * Fails closed: a missing user or empty/missing allowlists deny access.
 *
 * Called at request-time (every API-key or session-cookie request) to defend
 * against pre-existing sessions/keys that predate the lockdown. See #11137.
 */
export function assertStagingAccess(
    env: {
        ENVIRONMENT?: string;
        STAGING_ALLOWED_GITHUB_IDS?: string;
        STAGING_ALLOWED_EMAILS?: string;
    },
    user:
        | { githubId?: number | null; email?: string | null }
        | null
        | undefined,
): void {
    if (env.ENVIRONMENT !== "staging") return;
    const allowedGithubIds = parseGithubIdList(env.STAGING_ALLOWED_GITHUB_IDS);
    const allowedEmails = parseEmailList(env.STAGING_ALLOWED_EMAILS);
    const ghId = user?.githubId;
    const email = normalizeEmail(user?.email);
    if (
        (!ghId || !allowedGithubIds.has(Number(ghId))) &&
        (!email || !allowedEmails.has(email))
    ) {
        throw new StagingAccessDeniedError();
    }
}

export function parseEmailList(raw: string | undefined | null): Set<string> {
    if (!raw) return new Set();
    const emails = new Set<string>();
    for (const part of raw.split(",")) {
        const normalized = normalizeEmail(part);
        if (normalized) emails.add(normalized);
    }
    return emails;
}

function normalizeEmail(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized?.includes("@") ? normalized : null;
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

    // Query keys end up in access logs, referrers and browser history. Their
    // owner can rotate them; an agent run token is handed to a third party
    // mid-run and cannot be, so it is Bearer-only.
    const queryKey = new URL(request.url).searchParams.get("key");
    return queryKey?.startsWith(AGENT_RUN_TOKEN_PREFIX) ? null : queryKey;
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

    if (rawApiKey.startsWith(AGENT_RUN_TOKEN_PREFIX)) {
        return authenticateAgentRunToken(rawApiKey, opts.env);
    }

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

async function authenticateAgentRunToken(
    rawToken: string,
    env: ApiKeyAuthBindings,
): Promise<ApiKeyAuthResult | null> {
    if (!env.BETTER_AUTH_SECRET) return null;

    let claims: AgentRunClaims;
    try {
        claims = await verifyAgentRunToken(rawToken, env.BETTER_AUTH_SECRET);
    } catch {
        return null;
    }

    const parent = await loadActiveApiKeyAuthResult({
        apiKeyId: claims.parentApiKeyId,
        rawApiKey: rawToken,
        env,
    });
    if (!parent) return null;

    // The token inherits the parent's model access but never its account scope:
    // it is a generation credential held by a third party, so it must not be
    // able to manage the owner's keys, endpoints or account.
    const models = parent.apiKey.permissions?.models;

    return {
        ...parent,
        apiKey: {
            ...parent.apiKey,
            permissions: models ? { models } : undefined,
        },
        agentRun: claims,
    };
}

/**
 * Loads an active API key by ID after another credential has authenticated it.
 * This deliberately does not accept the parent key's raw value so delegated
 * credentials never need to contain or recover that secret.
 */
async function loadActiveApiKeyAuthResult(opts: {
    apiKeyId: string;
    rawApiKey: string;
    env: ApiKeyAuthBindings;
}): Promise<ApiKeyAuthResult | null> {
    const db = drizzle(opts.env.DB, { schema });
    const byopClientKey = alias(schema.apikey, "byop_client_key");
    const apiKeyData = await db
        .select({
            id: schema.apikey.id,
            name: schema.apikey.name,
            userId: schema.apikey.userId,
            enabled: schema.apikey.enabled,
            expiresAt: schema.apikey.expiresAt,
            permissions: schema.apikey.permissions,
            metadata: schema.apikey.metadata,
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
        .where(eq(schema.apikey.id, opts.apiKeyId))
        .get();

    if (
        !apiKeyData ||
        apiKeyData.enabled === false ||
        (apiKeyData.expiresAt && apiKeyData.expiresAt <= new Date())
    ) {
        return null;
    }

    const userData = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, apiKeyData.userId))
        .get();
    if (!userData) return null;

    assertNotBanned(userData);
    assertStagingAccess(opts.env, userData);

    return {
        user: userData,
        apiKey: {
            id: apiKeyData.id,
            name: apiKeyData.name ?? undefined,
            permissions: normalizePermissions(
                parseMetadata(apiKeyData.permissions),
            ),
            metadata: normalizeMetadata(parseMetadata(apiKeyData.metadata)),
            pollenBalance: apiKeyData.pollenBalance ?? null,
            byopClientKeyId: apiKeyData.byopClientKeyId ?? null,
            byopClientName: apiKeyData.byopClientName ?? null,
            byopClientUserId: apiKeyData.byopClientUserId ?? null,
            rawKey: opts.rawApiKey,
        },
        rawApiKey: opts.rawApiKey,
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
        if (safeScopes.length || key === "models") {
            permissions[key] = safeScopes;
        }
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
