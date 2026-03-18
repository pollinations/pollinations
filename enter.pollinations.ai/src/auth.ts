import {
    type BetterAuthOptions,
    type BetterAuthPlugin,
    betterAuth,
    type GenericEndpointContext,
    type User as GenericUser,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, apiKey, openAPI } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as betterAuthSchema from "./db/schema/better-auth.ts";
import {
    account as accountTable,
    user as userTable,
} from "./db/schema/better-auth.ts";
import { sendTierEventToTinybird } from "./events.ts";
import { DEFAULT_TIER, getTierPollen } from "./tier-config.ts";

// Track which API keys have been written to KV in this isolate.
// Better Auth writes tracking data (lastRequest, requestCount, updatedAt) to KV
// on every verify call. At ~3-5M req/day this exceeds KV's write limits (429s).
// First write per key (cache-warm on KV miss) goes through; subsequent writes
// (verify tracking updates) are skipped. Session writes are unaffected.
// Dashboard reads lastRequest from D1 (updated via deferUpdates).
const kvWrittenKeys = new Set<string>();

function addKeyPrefix(key: string) {
    return `auth:${key}`;
}

export function createAuth(env: Cloudflare.Env, ctx?: ExecutionContext) {
    const db = drizzle(env.DB);

    const PUBLISHABLE_KEY_PREFIX = "pk";

    const apiKeyPlugin = apiKey({
        storage: "secondary-storage",
        fallbackToDatabase: true,
        enableMetadata: true,
        deferUpdates: true, // Defers lastRequest/requestCount updates - OK if dropped, prevents D1 contention
        defaultPrefix: PUBLISHABLE_KEY_PREFIX,
        defaultKeyLength: 16, // Minimum key length for validation (matches custom generator)
        minimumNameLength: 1, // Allow short hostnames (e.g., "x.ai")
        maximumNameLength: 253, // DNS hostname max length
        startingCharactersConfig: {
            charactersLength: 10, // Store more characters for display (pk_xxxxxxxxxx...)
        },
        customKeyGenerator: (options: {
            length: number;
            prefix: string | undefined;
        }) => {
            // Publishable keys (pk_) are SHORT (16 chars), Secret keys (sk_) are LONG (32 chars)
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
            minExpiresIn: 0, // No minimum - allow any positive expiry
            maxExpiresIn: 365, // Max 1 year
        },
        rateLimit: {
            enabled: false, // Disabled - Roblox games hit rate limits with many concurrent players
        },
    });

    const adminPlugin = admin({
        adminUserIds: ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"],
    });

    const openAPIPlugin = openAPI({
        disableDefaultReference: true,
    });

    return betterAuth({
        basePath: "/api/auth",
        onAPIError: {
            errorURL: "/error",
        },
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
        advanced: {
            // Configure background tasks for Cloudflare Workers
            // Required for deferUpdates to work properly
            backgroundTasks: ctx
                ? {
                      handler: (promise: Promise<any>) => {
                          ctx.waitUntil(
                              promise.catch(() => {
                                  // Silently ignore - these are non-critical tracking updates
                                  // (lastRequest, requestCount) that fail due to D1 contention
                                  // under high concurrent load. Auth still works correctly.
                              }),
                          );
                      },
                  }
                : undefined,
        },
        secondaryStorage: {
            get: async (key) => {
                return await env.KV.get(addKeyPrefix(key));
            },
            set: async (key, value, ttl) => {
                if (key.startsWith("api-key:")) {
                    const prefixedKey = addKeyPrefix(key);
                    if (kvWrittenKeys.has(prefixedKey)) return;
                    await env.KV.put(prefixedKey, value, {
                        expirationTtl: ttl,
                    });
                    kvWrittenKeys.add(prefixedKey);
                    return;
                }
                await env.KV.put(addKeyPrefix(key), value, {
                    expirationTtl: ttl,
                });
            },
            delete: async (key) => {
                const prefixedKey = addKeyPrefix(key);
                kvWrittenKeys.delete(prefixedKey);
                await env.KV.delete(prefixedKey);
            },
        },
        trustedOrigins: ["*"],
        user: {
            additionalFields: {
                githubId: {
                    type: "number",
                    input: false,
                },
                githubUsername: {
                    type: "string",
                    input: false,
                },
                tier: {
                    type: "string",
                    defaultValue: "spore",
                    input: false,
                },
            },
        },
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                mapProfileToUser: (profile) => ({
                    githubId: profile.id,
                    githubUsername: profile.login,
                }),
            },
        },
        plugins: [
            adminPlugin,
            apiKeyPlugin,
            tierPlugin(env, ctx),
            openAPIPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

/**
 * Plugin to initialize tier balance for new users in D1.
 * This replaces the old Polar-based tier management.
 */
function tierPlugin(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
): BetterAuthPlugin {
    return {
        id: "tier",
        init: (_ctx) => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            after: onAfterUserCreate(env, executionCtx),
                        },
                    },
                    session: {
                        create: {
                            after: onAfterSessionCreate(env, executionCtx),
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}

/**
 * Sync github_username on every login.
 * GitHub usernames are mutable — users can rename their account.
 * We fetch the current username from GitHub API using the immutable github_id
 * and update D1 if it changed. Non-blocking via waitUntil.
 *
 * When github_id is missing from the user table (legacy rows), we resolve it
 * from the account table and backfill so subsequent logins skip the fallback.
 */
function onAfterSessionCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (
        session: { userId: string },
        _ctx?: GenericEndpointContext | null,
    ) => {
        executionCtx?.waitUntil(
            (async () => {
                try {
                    const db = drizzle(env.DB);
                    const [user] = await db
                        .select({
                            githubId: userTable.githubId,
                            githubUsername: userTable.githubUsername,
                        })
                        .from(userTable)
                        .where(eq(userTable.id, session.userId))
                        .limit(1);

                    let githubId = user?.githubId;

                    // Fallback: resolve github_id from the account table
                    if (!githubId) {
                        const [acct] = await db
                            .select({ accountId: accountTable.accountId })
                            .from(accountTable)
                            .where(
                                and(
                                    eq(accountTable.userId, session.userId),
                                    eq(accountTable.providerId, "github"),
                                ),
                            )
                            .limit(1);

                        if (!acct?.accountId) return;
                        githubId = Number(acct.accountId);

                        // Backfill so subsequent logins skip this fallback
                        await db
                            .update(userTable)
                            .set({ githubId })
                            .where(eq(userTable.id, session.userId));
                    }

                    const headers: Record<string, string> = {
                        Accept: "application/vnd.github+json",
                        "User-Agent": "pollinations-enter",
                    };
                    // Use OAuth app credentials for 5,000 req/hr (vs 60 unauthenticated)
                    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
                        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
                    }
                    const res = await fetch(
                        `https://api.github.com/user/${githubId}`,
                        { headers },
                    );
                    if (!res.ok) {
                        console.error(
                            `[username-sync] GitHub API ${res.status} for user ${githubId}`,
                        );
                        return;
                    }

                    const profile = (await res.json()) as { login: string };
                    if (
                        profile.login &&
                        profile.login !== user?.githubUsername
                    ) {
                        await db
                            .update(userTable)
                            .set({ githubUsername: profile.login })
                            .where(eq(userTable.id, session.userId));
                    }
                } catch (e) {
                    console.error(
                        "[username-sync] failed for session",
                        session.userId,
                        e,
                    );
                }
            })(),
        );
    };
}

/**
 * Set initial tier balance in D1 after user creation.
 * This guarantees new users get their default tier pollen.
 */
function onAfterUserCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (user: GenericUser, _ctx: GenericEndpointContext | null) => {
        try {
            const db = drizzle(env.DB);
            const tierBalance = getTierPollen(DEFAULT_TIER);
            await db
                .update(userTable)
                .set({
                    tierBalance,
                    lastTierGrant: Date.now(),
                })
                .where(eq(userTable.id, user.id));

            // Log user registration event to Tinybird
            // Use the ExecutionContext passed from createAuth, not better-auth's internal context
            executionCtx?.waitUntil(
                sendTierEventToTinybird(
                    {
                        event_type: "user_registration",
                        environment: env.ENVIRONMENT || "unknown",
                        user_id: user.id,
                        tier: DEFAULT_TIER,
                        pollen_amount: tierBalance,
                    },
                    env.TINYBIRD_TIER_INGEST_URL,
                    env.TINYBIRD_TIER_INGEST_TOKEN,
                ),
            );
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `User tier initialization failed. Error: ${messageOrError}`,
            });
        }
    };
}
