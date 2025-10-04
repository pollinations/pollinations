import { Polar } from "@polar-sh/sdk";
import {
    type BetterAuthOptions,
    type BetterAuthPlugin,
    betterAuth,
    type GenericEndpointContext,
    type User,
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

    const db = drizzle(env.DB);

    const apiKeyPlugin = apiKey({
        enableMetadata: true,
        permissions: {
            defaultPermissions: {
                "tier": ["flower"],
            },
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
        plugins: [adminPlugin, apiKeyPlugin, polarPlugin(polar), openAPIPlugin],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

function polarPlugin(polar: Polar): BetterAuthPlugin {
    return {
        id: "polar",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            before: onBeforeUserCreate(polar),
                            after: onAfterUserCreate(polar),
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

function onAfterUserCreate(polar: Polar) {
    return async (user: User, ctx?: GenericEndpointContext) => {
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
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Polar customer update failed. Error: ${messageOrError}`,
            });
        }
    };
}

function onUserUpdate(polar: Polar) {
    return async (user: User, ctx?: GenericEndpointContext) => {
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
