import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { user as userTable } from "@/db/schema/better-auth.ts";
import {
    getTierPollen,
    type TierName,
    type TierStatus,
    tierNames,
} from "@/tier-config.ts";
import { capitalize } from "@/util.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const TierStatusSchema = z.object({
    target: z.literal(tierNames),
    active: z.object({
        tier: z.literal([...tierNames, "none"]),
        displayName: z.string(),
        dailyPollen: z.number(),
    }),
});

export type TierSubscriptionStatus = z.infer<typeof TierStatusSchema>;

export const tiersRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .get(
        "/view",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get the current user's tier status and daily pollen information.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(TierStatusSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const log = c.get("log").getChild("tier");
            const user = c.var.auth.requireUser();

            // Query D1 directly for fresh tier (not cached session)
            const db = drizzle(c.env.DB);
            const users = await db
                .select({ tier: userTable.tier })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const userTier = (users[0]?.tier || "spore") as TierName;
            const dailyPollen = getTierPollen(userTier);

            log.debug(`User tier from D1: ${userTier}, email: ${user.email}`);

            const tierStatus: TierSubscriptionStatus = {
                target: userTier,
                active: {
                    tier: userTier as TierStatus,
                    displayName: capitalize(userTier),
                    dailyPollen,
                },
            };

            return c.json(tierStatus);
        },
    );

export type TiersRoutes = typeof tiersRoutes;
