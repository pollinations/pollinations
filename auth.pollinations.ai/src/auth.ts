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
        server: "sandbox",
    });

    const db = drizzle(env.DB);

    const apiKeyPlugin = apiKey({
        permissions: {
            defaultPermissions: {
                "model_access": ["flower_tier"],
            },
        },
    });

    const adminPlugin = admin({
        adminUserIds: ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"],
    });

    return betterAuth({
        baseURL: env.BASE_URL,
        basePath: "/api/auth",
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
            },
        },
        plugins: [adminPlugin, apiKeyPlugin, polarPlugin(polar), openAPI()],
        telemetry: { enabled: false },
    });
}

function polarPlugin(polar: Polar): BetterAuthPlugin {
    return {
        id: "polar",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            after: onUserCreate(polar),
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

function onUserCreate(polar: Polar) {
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
            } else {
                const _customer = await polar.customers.create({
                    email: user.email,
                    name: user.name,
                    externalId: user.id,
                });
            }
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Polar customer creation failed. Error: ${messageOrError}`,
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
