import { apiKey, defaultKeyHasher } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
    and,
    eq,
    getTableColumns,
    isNull,
    lt,
    or,
    type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import { byopClientAllowsMarkup } from "../billing/markup.ts";
import * as schema from "../db/better-auth.ts";
import {
    AGENT_RUN_TOKEN_PREFIX,
    type AgentRunClaims,
    verifyAgentRunToken,
} from "./agent-run-token.ts";
import { parseMetadata } from "./api-key-metadata.ts";
import { isUserBanned } from "./ban.ts";
import { parseGithubIdList } from "./github-id-list.ts";
import { SESSION_TOKEN_PREFIX, verifySessionToken } from "./session-token.ts";

const PUBLISHABLE_KEY_PREFIX = "pk";

export type AuthUser = typeof schema.user.$inferSelect;

export interface AuthenticatedApiKey {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    pollenBalance?: number | null;
    expiresAt?: Date | null;
    /** Charges never fall through to the owner's paid balance. */
    questPollenOnly?: boolean;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
    /** True when deduction will add BYOP markup. Set at auth so preflight matches. */
    byopMarkupApplies?: boolean;
    rawKey?: string;
}

export interface ApiKeyAuthResult {
    user?: AuthUser;
    /** Absent for a session token: the account owner, with no key restrictions. */
    apiKey?: AuthenticatedApiKey;
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
            // Override Better Auth's 365-day default with JavaScript Date's range.
            maxExpiresIn: 100_000_000,
        },
        rateLimit: {
            enabled: false,
        },
    });
}

export function createApiKeyAuth(
    env: ApiKeyAuthBindings,
    ctx?: Pick<ExecutionContext, "waitUntil">,
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

    // E2B's SDKs send the key in X-API-KEY.
    const headerKey = request.headers.get("x-api-key");
    if (headerKey) return headerKey;

    // Query keys end up in access logs, referrers and browser history. Their
    // owner can rotate them; agent run and session tokens cannot be revoked,
    // so they are Bearer-only.
    const queryKey = new URL(request.url).searchParams.get("key");
    return queryKey?.startsWith(AGENT_RUN_TOKEN_PREFIX) ||
        queryKey?.startsWith(SESSION_TOKEN_PREFIX)
        ? null
        : queryKey;
}

export function assertNotBanned(user: {
    banned?: boolean | null;
    banExpires?: Date | string | null;
    banReason?: string | null;
}): void {
    if (!isUserBanned(user)) return;
    throw new BannedAccountError(
        user.banReason ? `Account banned: ${user.banReason}` : "Account banned",
    );
}

// A key that is unknown, disabled or expired stays rejected from the cache for
// this long, so a flood repeating bad keys stops reaching D1.
const INVALID_KEY_CACHE_SECONDS = 300;
// "Last used" is shown to the owner; minute precision is not needed, and a
// write per request was most of D1's load during the 2026-10-27 floods.
const LAST_REQUEST_WRITE_INTERVAL_MS = 5 * 60_000;

export async function authenticateApiKeyRequest(opts: {
    request: Request;
    env: ApiKeyAuthBindings;
    ctx?: Pick<ExecutionContext, "waitUntil">;
}): Promise<ApiKeyAuthResult | null> {
    const rawApiKey = extractApiKey(opts.request);
    if (!rawApiKey) return null;

    if (rawApiKey.startsWith(AGENT_RUN_TOKEN_PREFIX)) {
        return authenticateAgentRunToken(rawApiKey, opts.env);
    }
    if (rawApiKey.startsWith(SESSION_TOKEN_PREFIX)) {
        return authenticateSessionToken(rawApiKey, opts.env);
    }

    // Better Auth's verifyApiKey does this lookup plus two awaited writes per
    // call (last_request and updated_at). Our keys use none of its quota or
    // rate-limit features, so look the key up by hash directly.
    const keyHash = await defaultKeyHasher(rawApiKey);
    const invalidKeyCacheKey = new Request(
        new URL(`/__invalid-api-key/${keyHash}`, opts.request.url),
    );
    const invalidKeys = await caches.open("invalid-api-keys");
    if (await invalidKeys.match(invalidKeyCacheKey)) return null;

    const row = await selectApiKeyRow(opts.env, eq(schema.apikey.key, keyHash));
    const result = toActiveAuthResult(row, rawApiKey, opts.env);
    if (!result || !row) {
        const remember = invalidKeys.put(
            invalidKeyCacheKey,
            new Response(null, {
                headers: {
                    "Cache-Control": `max-age=${INVALID_KEY_CACHE_SECONDS}`,
                },
            }),
        );
        runInBackground(remember, opts.ctx);
        return null;
    }

    const lastRequest = row.apiKey.lastRequest;
    const staleBefore = new Date(Date.now() - LAST_REQUEST_WRITE_INTERVAL_MS);
    if (!lastRequest || lastRequest < staleBefore) {
        const touch = drizzle(opts.env.DB)
            .update(schema.apikey)
            .set({ lastRequest: new Date() })
            .where(
                and(
                    eq(schema.apikey.id, row.apiKey.id),
                    or(
                        isNull(schema.apikey.lastRequest),
                        lt(schema.apikey.lastRequest, staleBefore),
                    ),
                ),
            )
            .run();
        runInBackground(touch, opts.ctx);
    }
    return result;
}

function runInBackground(
    promise: Promise<unknown>,
    ctx?: Pick<ExecutionContext, "waitUntil">,
): void {
    const settled = promise.catch(() => undefined);
    ctx?.waitUntil(settled);
}

/**
 * The key row that a raw key hashes to, if it can be used: Better Auth's
 * verifyApiKey checks without its per-call writes.
 */
export async function findUsableApiKey(
    env: Pick<ApiKeyAuthBindings, "DB">,
    rawKey: string,
): Promise<typeof schema.apikey.$inferSelect | null> {
    const row = await drizzle(env.DB, { schema }).query.apikey.findFirst({
        where: eq(schema.apikey.key, await defaultKeyHasher(rawKey)),
    });
    if (!row || !isUsable(row)) return null;
    return row;
}

function isUsable(key: {
    enabled: boolean | null;
    expiresAt: Date | null;
}): boolean {
    return (
        key.enabled !== false && !(key.expiresAt && key.expiresAt <= new Date())
    );
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

    // Agent-run tokens leave our control. Keep the parent's generation limits,
    // but never let an agent manage the owner's account or keys.
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

async function authenticateSessionToken(
    rawToken: string,
    env: ApiKeyAuthBindings,
): Promise<ApiKeyAuthResult | null> {
    if (!env.BETTER_AUTH_SECRET) return null;

    let userId: string;
    try {
        userId = await verifySessionToken(rawToken, env.BETTER_AUTH_SECRET);
    } catch {
        return null;
    }

    const user = await drizzle(env.DB)
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .get();
    if (!user) return null;

    assertNotBanned(user);
    assertStagingAccess(env, user);
    return { user, rawApiKey: rawToken };
}

/**
 * Loads an active API key by ID after another credential has authenticated it.
 * This deliberately does not accept the parent key's raw value so delegated
 * credentials never need to contain or recover that secret.
 */
export async function loadActiveApiKeyAuthResult(opts: {
    apiKeyId: string;
    rawApiKey: string;
    env: ApiKeyAuthBindings;
}): Promise<(ApiKeyAuthResult & { apiKey: AuthenticatedApiKey }) | null> {
    const row = await selectApiKeyRow(
        opts.env,
        eq(schema.apikey.id, opts.apiKeyId),
    );
    return toActiveAuthResult(row, opts.rawApiKey, opts.env);
}

type ApiKeyRow = Awaited<ReturnType<typeof selectApiKeyRow>>;

async function selectApiKeyRow(env: ApiKeyAuthBindings, where: SQL) {
    const db = drizzle(env.DB, { schema });
    const byopClientKey = alias(schema.apikey, "byop_client_key");
    const byopOwner = alias(schema.user, "byop_owner");
    return db
        .select({
            apiKey: getTableColumns(schema.apikey),
            user: getTableColumns(schema.user),
            byopClientName: byopClientKey.name,
            byopOwner: {
                banned: byopOwner.banned,
                banExpires: byopOwner.banExpires,
            },
            byopClientUserId: byopClientKey.referenceId,
            byopClientPrefix: byopClientKey.prefix,
            byopClientEnabled: byopClientKey.enabled,
            byopClientExpiresAt: byopClientKey.expiresAt,
            byopClientMetadata: byopClientKey.metadata,
        })
        .from(schema.apikey)
        .innerJoin(schema.user, eq(schema.user.id, schema.apikey.referenceId))
        .leftJoin(
            byopClientKey,
            eq(byopClientKey.id, schema.apikey.byopClientKeyId),
        )
        .where(where)
        .leftJoin(byopOwner, eq(byopOwner.id, byopClientKey.referenceId))
        .get();
}

function toActiveAuthResult(
    row: ApiKeyRow,
    rawApiKey: string,
    env: ApiKeyAuthBindings,
): (ApiKeyAuthResult & { apiKey: AuthenticatedApiKey }) | null {
    if (!row || !isUsable(row.apiKey)) return null;

    assertNotBanned(row.user);
    if (row.byopOwner) assertNotBanned(row.byopOwner);
    assertStagingAccess(env, row.user);

    return {
        user: row.user,
        apiKey: {
            id: row.apiKey.id,
            name: row.apiKey.name ?? undefined,
            permissions: normalizePermissions(
                parseMetadata(row.apiKey.permissions),
            ),
            metadata: normalizeMetadata(parseMetadata(row.apiKey.metadata)),
            pollenBalance: row.apiKey.pollenBalance ?? null,
            expiresAt: row.apiKey.expiresAt,
            questPollenOnly: row.apiKey.questPollenOnly,
            byopClientKeyId: row.apiKey.byopClientKeyId ?? null,
            byopClientName: row.byopClientName ?? null,
            byopClientUserId: row.byopClientUserId ?? null,
            byopMarkupApplies: byopClientAllowsMarkup(
                {
                    userId: row.byopClientUserId,
                    prefix: row.byopClientPrefix,
                    enabled: row.byopClientEnabled,
                    expiresAt: row.byopClientExpiresAt,
                    metadata: row.byopClientMetadata,
                },
                row.user.id,
            ),
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
