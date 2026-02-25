import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { createAuth } from "../auth.ts";
import * as schema from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
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
export const appLookupRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["Account"],
        description:
            "Look up app attribution by app_key or redirect_url. No auth required.",
        hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
    }),
    async (c) => {
        const appKey = c.req.query("app_key");
        const redirectUrl = c.req.query("redirect_url");
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
        if (redirectUrl) {
            const keys = await db.query.apikey.findMany();
            for (const key of keys) {
                const meta = parseMetadata(key.metadata);
                if (
                    meta.keyType === "publishable" &&
                    typeof meta.appUrl === "string" &&
                    redirectUrl.startsWith(meta.appUrl)
                ) {
                    return c.json(await resolveAttribution(db, key));
                }
            }
        }

        return c.json({ found: false });
    },
);
