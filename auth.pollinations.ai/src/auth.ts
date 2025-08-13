import { checkout, polar, usage } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey, openAPI } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as betterAuthSchema from "./db/schema/better-auth.ts";

export function createAuth(env: Cloudflare.Env) {
    const polarClient = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: "sandbox",
    });

    const polarPlugin = polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        use: [
            checkout({
                products: [
                    {
                        productId: "816c4274-d2ec-4b79-b013-6d89cada85d2",
                        slug: "pollen-refill-medium",
                    },
                ],
                successUrl: env.POLAR_SUCCESS_URL,
                authenticatedUsersOnly: true,
            }),
            usage(),
        ],
    });

    const apiKeyPlugin = apiKey({});

    const db = drizzle(env.DB);

    return betterAuth({
        basePath: "/api/v1/auth",
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
        plugins: [polarPlugin, apiKeyPlugin, openAPI()],
    });
}
