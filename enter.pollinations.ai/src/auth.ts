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

export function createAuth(env: Cloudflare.Env) {
    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER,
    });

    const defaultTierProductId = env.POLAR_PRODUCT_TIER_SPORE;

    const db = drizzle(env.DB);

    const PUBLISHABLE_KEY_PREFIX = "pk";
    const SECRET_KEY_PREFIX = "sk";

    const apiKeyPlugin = apiKey({
        enableMetadata: true,
        defaultPrefix: PUBLISHABLE_KEY_PREFIX,
        defaultKeyLength: 16, // Minimum key length for validation (matches custom generator)
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
        rateLimit: {
            enabled: true,
            timeWindow: 1000, // 1 second
            maxRequests: 5, // 5 requests
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
                    message:
                        "Polar customer creation failed: missing email address",
                });
            }

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
                    },
                };
            }

            await polar.customers.create({
                email: user.email,
                name: user.name,
                externalId: user.id,
            });

            return {
                data: user,
            };
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Polar customer creation failed. Error: ${messageOrError}`,
            });
        }
    };
}

function onAfterUserCreate(polar: Polar, defaultTierProductId?: string) {
    return async (user: GenericUser, ctx?: GenericEndpointContext) => {
        if (!ctx) return;
        try {
            const { result } = await polar.customers.list({
                email: user.email,
            });
            const existingCustomer = result.items[0];

            if (existingCustomer && existingCustomer.externalId !== user.id) {
                await polar.customers.update({
                    id: existingCustomer.id,
                    customerUpdate: {
                        externalId: user.id,
                    },
                });
            }

            // Auto-create subscription for new user's default tier
            if (existingCustomer && defaultTierProductId) {
                try {
                    // Check if user already has an active subscription
                    const { result: subs } = await polar.subscriptions.list({
                        customerId: existingCustomer.id,
                        active: true,
                        limit: 1,
                    });

                    if (subs.items.length === 0) {
                        // No active subscription, create one for the default tier
                        await polar.subscriptions.create({
                            productId: defaultTierProductId,
                            customerId: existingCustomer.id,
                        });
                        ctx.context.logger.info(
                            `Created default tier subscription for user ${user.id}`,
                        );
                    }
                } catch (subError) {
                    // Log but don't fail user creation if subscription fails
                    ctx.context.logger.error(
                        `Failed to create default subscription: ${subError}`,
                    );
                }
            }
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
