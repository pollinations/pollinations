import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { getTierPollen } from "@/tier-config.ts";
import { capitalize } from "@/util.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { type TierName, type TierStatus, tierNames } from "@/utils/polar.ts";
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

            // Tier is now D1-only - no Polar subscription fetching
            const userTier = (user.tier || "spore") as TierName;
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
