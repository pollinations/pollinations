import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { createAuth } from "../auth.ts";
import * as schema from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { validator } from "../middleware/validator.ts";
import { parseMetadata } from "./metadata-utils.ts";

async function resolveAttribution(
    db: ReturnType<typeof drizzle<typeof schema>>,
    keyRow: typeof schema.apikey.$inferSelect,
) {
    const meta = parseMetadata(keyRow.metadata);
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, keyRow.userId),
    });
    return {
        found: true as const,
        userId: keyRow.userId,
        userName: user?.name,
        githubUsername: user?.githubUsername || undefined,
        appName: keyRow.name,
        appUrl: (meta.appUrl as string) || undefined,
    };
}

/**
 * Public endpoint to resolve an app_key or redirect_url to attribution info.
 * No auth required — used during the /authorize flow.
 */
const AppLookupQuerySchema = z.object({
    app_key: z
        .string()
        .startsWith("pk_")
        .optional()
        .describe(
            "Your publishable App Key (pk_...). When provided, the consent screen shows your app name and GitHub username instead of a generic hostname. Create one at enter.pollinations.ai → Create New App Key.",
        ),
    redirect_url: z
        .string()
        .url()
        .optional()
        .describe(
            "The URL users return to after authorizing. If no app_key is provided, the system tries to match this URL against registered app URLs.",
        ),
});

export const appLookupRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["Account"],
        description:
            "Look up app attribution by app_key or redirect_url. No auth required. Used during the /authorize BYOP flow to resolve the app name and author shown on the consent screen.",
        hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
    }),
    validator("query", AppLookupQuerySchema),
    async (c) => {
        const { app_key: appKey, redirect_url: redirectUrl } =
            c.req.valid("query");
        const db = drizzle(c.env.DB, { schema });

        // Strategy 1: Explicit app_key — verify via better-auth
        if (appKey) {
            const auth = createAuth(c.env);
            const result = await auth.api.verifyApiKey({
                body: { key: appKey },
            });
            if (result.valid && result.key) {
                const keyRow = await db.query.apikey.findFirst({
                    where: eq(schema.apikey.id, result.key.id),
                });
                if (keyRow) {
                    return c.json(await resolveAttribution(db, keyRow));
                }
            }
        }

        // Strategy 2: Match redirect_url against registered appUrl values
        // Fetch all publishable keys with appUrl and match in JS
        // (D1 rejects the LIKE pattern at scale with "pattern too complex")
        if (redirectUrl) {
            const candidates = await db.query.apikey.findMany({
                where: sql`json_extract(${schema.apikey.metadata}, '$.keyType') = 'publishable' AND json_extract(${schema.apikey.metadata}, '$.appUrl') IS NOT NULL`,
            });
            // Find the best match: longest appUrl that is a prefix of redirectUrl
            // Case-insensitive to handle mixed-case registrations
            const redirectLower = redirectUrl.toLowerCase();
            let bestMatch: (typeof candidates)[number] | null = null;
            let bestLen = 0;
            for (const row of candidates) {
                const meta = parseMetadata(row.metadata);
                const appUrl = meta.appUrl as string;
                if (
                    appUrl &&
                    redirectLower.startsWith(appUrl.toLowerCase()) &&
                    appUrl.length > bestLen
                ) {
                    bestMatch = row;
                    bestLen = appUrl.length;
                }
            }
            if (bestMatch) {
                return c.json(await resolveAttribution(db, bestMatch));
            }
        }

        return c.json({ found: false });
    },
);
