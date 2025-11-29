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
import {
    admin,
    apiKey,
    openAPI,
    oidcProvider,
    deviceAuthorization,
} from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as betterAuthSchema from "./db/schema/better-auth.ts";

export function createAuth(env: Cloudflare.Env) {
    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER,
    });

    const db = drizzle(env.DB);

    const PUBLISHABLE_KEY_PREFIX = "pk";
    const SECRET_KEY_PREFIX = "sk";

    const apiKeyPlugin = apiKey({
        enableMetadata: true,
        defaultPrefix: PUBLISHABLE_KEY_PREFIX,
        defaultKeyLength: 16, // Minimum key length for validation (matches custom generator)
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

    // Device Authorization (RFC 8628) for CLI/IoT login
    const deviceAuthPlugin = deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "10m", // 10 minutes for code entry
        // Allow any client_id for simplicity (we're the only client)
        validateClient: async () => true,
    });

    // OIDC Provider - "Login with Pollinations" for third-party apps
    const oidcProviderPlugin = oidcProvider({
        loginPage: "/oauth/login",
        consentPage: "/oauth/consent",
        // Trusted first-party clients - bypass DB lookup and skip consent
        trustedClients: [
            {
                clientId: "test-app",
                clientSecret: "test-secret",
                type: "web" as const,
                name: "Test OAuth App",
                disabled: false,
                metadata: null,
                redirectUrls: [
                    // Allow any localhost callback for dev testing
                    "http://localhost:3000/callback",
                    "http://localhost:5173/callback",
                    "http://localhost:8080/callback",
                    "http://localhost:8000/callback",
                    "http://127.0.0.1:3000/callback",
                    "http://127.0.0.1:5173/callback",
                    "http://127.0.0.1:8080/callback",
                    // Test pages that redirect back to themselves
                    "http://localhost:8080/test-oidc.html",
                    "http://localhost:3000/test-oidc.html",
                    "http://localhost:5173/test-oidc.html",
                    "http://localhost:3000/demo-image-gen.html",
                    "http://localhost:5173/demo-image-gen.html",
                    "http://localhost:8080/demo-image-gen.html",
                    "http://localhost:3000/demo-image-gen",
                    "http://localhost:5173/demo-image-gen",
                    "http://localhost:8080/demo-image-gen",
                ],
                skipConsent: true,
            },
            {
                clientId: "pollinations-mcp",
                clientSecret: "mcp-secret",
                type: "public" as const,
                name: "Pollinations MCP Server",
                disabled: false,
                metadata: null,
                redirectUrls: [
                    "http://localhost:3000/callback",
                    "http://localhost:8080/callback",
                    "http://127.0.0.1:3000/callback",
                    "http://127.0.0.1:8080/callback",
                ],
                skipConsent: true,
            },
        ],
    });

    return betterAuth({
        basePath: "/api/auth",
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
        trustedOrigins: [
            "https://enter.pollinations.ai",
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8080",
        ],
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
            deviceAuthPlugin,
            polarPlugin(polar),
            openAPIPlugin,
            oidcProviderPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

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

function onAfterUserCreate(polar: Polar) {
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
