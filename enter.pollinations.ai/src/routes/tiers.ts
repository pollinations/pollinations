import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { User } from "@/auth.ts";
import { capitalize } from "@/util.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import {
    calculateNextPeriodStart,
    getTierProductById,
    getTierProductMapCached,
    type TierName,
    type TierStatus,
    tierNames,
} from "@/utils/polar.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { type PolarVariables, polar } from "../middleware/polar.ts";

const TierSubscriptionDetailsSchema = z.object({
    status: z.literal(["active", "canceled", "trialing", "none"]),
    endsAt: z.iso.datetime().optional(),
    canceledAt: z.iso.datetime().optional(),
    nextRefillAt: z.iso.datetime().optional(),
    dailyPollen: z.number().optional(),
});

const TierSubscriptionStatusSchema = z.object({
    target: z.literal(tierNames),
    active: z.object({
        tier: z.literal([...tierNames, "none"]),
        displayName: z.string(),
        subscriptionDetails: TierSubscriptionDetailsSchema.optional(),
    }),
});

export type TierSubscriptionStatus = z.infer<
    typeof TierSubscriptionStatusSchema
>;

async function getTierSubscriptionStatus(
    { polar }: PolarVariables,
    kv: KVNamespace,
    user: User,
): Promise<TierSubscriptionStatus> {
    const tierProductMap = await getTierProductMapCached(polar.client, kv);
    const customerState = await polar.getCustomerState(user.id);

    const tierSubscription = customerState.activeSubscriptions?.at(0);
    const tierProduct = getTierProductById(
        tierSubscription?.productId,
        tierProductMap,
    );
    const tierBenefit = tierProduct?.benefits
        .filter((benefit) => benefit.type === "meter_credit")
        .at(0);
    const tierName = (tierProduct?.metadata.slug as string)?.split(":").at(-1);
    const subscriptionDetails = tierSubscription
        ? {
              status: tierSubscription.status,
              endsAt: tierSubscription.endsAt?.toISOString() || undefined,
              canceledAt:
                  tierSubscription.canceledAt?.toISOString() || undefined,
              nextRefillAt: calculateNextPeriodStart(
                  tierSubscription.currentPeriodStart,
              ).toISOString(),
              dailyPollen: tierBenefit?.properties?.units,
          }
        : undefined;
    return {
        target: (user.tier || "spore") as TierName,
        active: {
            tier: (tierName || "none") as TierStatus,
            displayName: tierProduct?.name || capitalize(tierName || "none"),
            subscriptionDetails,
        },
    };
}

export const tiersRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .use(polar)
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
                            schema: resolver(TierSubscriptionStatusSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const log = c.get("log").getChild("tier");
            const user = c.var.auth.requireUser();

            // Get tier assigned in Cloudflare DB
            log.debug(`User tier from DB: ${user.tier}, email: ${user.email}`);

            const tierStatus = await getTierSubscriptionStatus(
                c.var,
                c.env.KV,
                user,
            );

            return c.json(tierStatus);
        },
    );

export type TiersRoutes = typeof tiersRoutes;
