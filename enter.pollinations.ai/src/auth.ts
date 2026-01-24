import { Polar } from "@polar-sh/sdk";
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
import { drizzle } from "drizzle-orm/d1";
import * as betterAuthSchema from "./db/schema/better-auth.ts";
import { DEFAULT_TIER, getTierPollen } from "./tier-config.ts";

function addKeyPrefix(key: string) {
    return `auth:${key}`;
}

export function createAuth(env: Cloudflare.Env) {
    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER,
    });

    const defaultTierProductId = env.POLAR_PRODUCT_TIER_SPORE;

    const db = drizzle(env.DB);

    const PUBLISHABLE_KEY_PREFIX = "pk";

    const apiKeyPlugin = apiKey({
        storage: "secondary-storage",
        fallbackToDatabase: true,
        enableMetadata: true,
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
            enabled: true,
            timeWindow: 1000, // 1 second
            maxRequests: 10000, // Support high-volume games (10k req/s)
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
        plugins: [
            adminPlugin,
            apiKeyPlugin,
            polarPlugin(polar, defaultTierProductId),
            openAPIPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

function polarPlugin(
    polar: Polar,
    defaultTierProductId?: string,
): BetterAuthPlugin {
    return {
        id: "polar",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            before: onBeforeUserCreate(polar),
                            after: onAfterUserCreate(
                                polar,
                                defaultTierProductId,
                            ),
                        },
                        update: {
                            after: onUserUpdate(polar),
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}

function onBeforeUserCreate(polar: Polar) {
    return async (user: Partial<User>, ctx?: GenericEndpointContext) => {
        if (!ctx) return;
        try {
            if (!user.email) {
                throw new APIError("BAD_REQUEST", {
                    message: "User creation failed: missing email address",
                });
            }

            // Set initial tier balance for new users
            const tierBalance = getTierPollen(DEFAULT_TIER);
            const lastTierGrant = new Date();

            // if the customer already exists, link the new account
            const { result } = await polar.customers.list({
                email: user.email,
            });
            const existingCustomer = result.items[0];
            if (existingCustomer?.externalId) {
                return {
                    data: {
                        ...user,
                        id: existingCustomer.externalId,
                        tierBalance,
                        lastTierGrant,
                    },
                };
            }

            await polar.customers.create({
                email: user.email,
                name: user.name,
                externalId: user.id,
            });

            return {
                data: {
                    ...user,
                    tierBalance,
                    lastTierGrant,
                },
            };
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `User creation failed. Error: ${messageOrError}`,
            });
        }
    };
}

function onAfterUserCreate(polar: Polar, _defaultTierProductId?: string) {
    return async (user: GenericUser, ctx?: GenericEndpointContext) => {
        if (!ctx) return;
        try {
            const { result } = await polar.customers.list({
                email: user.email,
            });
            const existingCustomer = result.items[0];

            // Link Polar customer to user ID (needed for pack purchases)
            if (existingCustomer && existingCustomer.externalId !== user.id) {
                await polar.customers.update({
                    id: existingCustomer.id,
                    customerUpdate: {
                        externalId: user.id,
                    },
                });
            }
            // Note: Tier subscription is NO LONGER created in Polar
            // Tier is managed entirely in D1 (set on registration, refilled by cron)
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Polar customer update failed. Error: ${messageOrError}`,
            });
        }
    };
}

function onUserUpdate(polar: Polar) {
    return async (user: GenericUser, ctx?: GenericEndpointContext) => {
        if (!ctx) return;
        try {
            await polar.customers.updateExternal({
                externalId: user.id,
                customerUpdateExternalID: {
                    email: user.email,
                    name: user.name,
                },
            });
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            ctx.context.logger.error(
                `Polar customer update failed. Error: ${messageOrError}`,
            );
        }
    };
}

// Note: ensureDefaultSubscription removed - tier is now D1-only (no Polar subscriptions)
