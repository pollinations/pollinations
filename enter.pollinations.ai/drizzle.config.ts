// biome-ignore-all lint/style/noNonNullAssertion: makes sense here
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./drizzle",
    schema: "../shared/db/better-auth.ts",
    dialect: "sqlite",
    driver: "d1-http",
    dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
        token: process.env.CLOUDFLARE_API_TOKEN!,
    },
});
