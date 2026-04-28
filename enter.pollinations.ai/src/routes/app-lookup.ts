import { eq } from "drizzle-orm";
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
        clientId: keyRow.id,
        userId: keyRow.userId,
        userName: user?.name,
        githubUsername: user?.githubUsername || undefined,
        appName: keyRow.name,
        appUrl: (meta.appUrl as string) || undefined,
        byopEnabled: meta.byopEnabled === true,
    };
}

/**
 * Public endpoint to resolve an app_key (client_id) to attribution info.
 * No auth required — used during the /authorize flow.
 *
 * Identity comes from client_id only. Redirect URLs are not used to infer
 * which app is calling: any developer can claim any URL by writing it into
 * their key's metadata, so URL-based attribution is not trustworthy.
 */
const AppLookupQuerySchema = z.object({
    client_id: z
        .string()
        .startsWith("pk_")
        .optional()
        .describe(
            "Your publishable App Key (pk_...). When provided, the consent screen shows your app name and GitHub username. Canonical OAuth name.",
        ),
    app_key: z
        .string()
        .startsWith("pk_")
        .optional()
        .describe(
            "Legacy alias for `client_id`. Accepted for backwards compatibility.",
        ),
});

export const appLookupRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["Account"],
        description:
            "Look up app attribution by client_id. No auth required. Used during the /authorize BYOP flow to resolve the app name and author shown on the consent screen. Without a client_id the consent screen falls back to a hostname-only display.",
        hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
    }),
    validator("query", AppLookupQuerySchema),
    async (c) => {
        const { client_id: clientId, app_key: appKey } = c.req.valid("query");
        const resolvedAppKey = clientId ?? appKey;
        if (!resolvedAppKey) {
            return c.json({ found: false });
        }

        const db = drizzle(c.env.DB, { schema });
        const auth = createAuth(c.env);
        const result = await auth.api.verifyApiKey({
            body: { key: resolvedAppKey },
        });
        if (result.valid && result.key) {
            const keyRow = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, result.key.id),
            });
            if (keyRow) {
                return c.json(await resolveAttribution(db, keyRow));
            }
        }

        return c.json({ found: false });
    },
);
