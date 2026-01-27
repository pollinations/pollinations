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
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as betterAuthSchema from "./db/schema/better-auth.ts";
import { user as userTable } from "./db/schema/better-auth.ts";
import { sendTierEventToTinybird } from "./events.ts";
import { DEFAULT_TIER, getTierPollen } from "./tier-config.ts";

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
                await env.KV.put(addKeyPrefix(key), value, {
                    expirationTtl: ttl,
                });
            },
            delete: async (key) => {
                await env.KV.delete(addKeyPrefix(key));
            },
        },
        trustedOrigins: ["https://enter.pollinations.ai", "http://localhost"],
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
        plugins: [adminPlugin, apiKeyPlugin, tierPlugin(env), openAPIPlugin],
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
function tierPlugin(env: Cloudflare.Env): BetterAuthPlugin {
    return {
        id: "tier",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            after: onAfterUserCreate(env),
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}

/**
 * Set initial tier balance in D1 after user creation.
 * This guarantees new users get their default tier pollen.
 */
function onAfterUserCreate(env: Cloudflare.Env) {
    return async (user: GenericUser, ctx?: GenericEndpointContext) => {
        if (!ctx) return;
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
            // Use optional chaining for test environments where executionCtx may not exist
            ctx.context.executionCtx?.waitUntil(
                sendTierEventToTinybird(
                    {
                        event_type: "user_registration",
                        environment: env.ENVIRONMENT || "unknown",
                        user_id: user.id,
                        tier: DEFAULT_TIER,
                        pollen_amount: tierBalance,
                        timestamp: new Date().toISOString(),
                    },
                    env.TINYBIRD_TIER_INGEST_URL,
                    env.TINYBIRD_INGEST_TOKEN,
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
