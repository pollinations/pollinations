import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";

type TierStatus = "none" | "spore" | "seed" | "flower" | "nectar" | "router";
type ActivatableTier = "spore" | "seed" | "flower" | "nectar" | "router";

// Polar subscription shape (only fields we use)
interface PolarSubscription {
    productId: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    canceledAt?: string | null;
}

// Central tier definition
const TIERS: readonly ActivatableTier[] = [
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
] as const;

// Get Polar product IDs from environment
function getTierProductId(env: Cloudflare.Env, tier: ActivatableTier): string {
    const key = `POLAR_PRODUCT_TIER_${tier.toUpperCase()}`;
    const productId = env[key as keyof Cloudflare.Env];
    if (!productId) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return productId as string;
}

interface TierViewModel {
    tier: TierStatus; // Current tier from Polar subscription
    tier_name?: string; // Display name of the tier
    daily_pollen?: number;
    next_refill_at_utc: string;
    has_polar_error: boolean;
    subscription_status?: string; // e.g., "active", "canceled"
    subscription_ends_at?: string; // currentPeriodEnd ISO timestamp
    subscription_canceled_at?: string; // canceledAt ISO timestamp
}

function getTierFromProductId(
    env: Cloudflare.Env,
    productId: string,
): TierStatus {
    const tier = TIERS.find(
        (tier) => getTierProductId(env, tier) === productId,
    );
    return tier || "none";
}

function getNextMidnightUTC(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Minimal Polar product/benefit typing to avoid unsafe any casts
type MeterCreditProperties = { units?: number; amount?: number }; // Polar uses "units", keeping "amount" for backward compat
type MeterCreditBenefit = {
    type: "meter_credit";
    properties?: MeterCreditProperties;
};
type PolarProductMinimal = {
    name: string;
    benefits?: Array<
        MeterCreditBenefit | { type: string; properties?: unknown }
    >;
};

function isMeterCreditBenefit(b: unknown): b is MeterCreditBenefit {
    return (
        !!b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "meter_credit"
    );
}

export const tiersRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .use(polar)
    .get(
        "/view",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get the current user's tier status and daily pollen information. Tier is determined by Polar subscription.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const log = c.get("log");
            const user = c.var.auth.requireUser();

            log.debug(`Fetching tier for user: ${user.email}`);
            let tier: TierStatus = "none";
            let tier_name: string | undefined;
            let daily_pollen: number | undefined;
            let next_refill_at_utc = getNextMidnightUTC(); // Default fallback
            let has_polar_error = false;
            let subscription_status: string | undefined;
            let subscription_ends_at: string | undefined;
            let subscription_canceled_at: string | undefined;

            try {
                // Get customer state from Polar (cached)
                const customerState = await c.var.polar.getCustomerState(
                    user.id,
                );

                const activeSubs = customerState.activeSubscriptions || [];

                // Find the active subscription (prioritize highest tier if multiple)
                if (activeSubs.length > 0) {
                    const activeSub =
                        activeSubs[0] as unknown as PolarSubscription;
                    const activeProductId = activeSub.productId;

                    tier = getTierFromProductId(c.env, activeProductId);

                    // Extract subscription status information with safe access
                    subscription_status = activeSub.status ?? undefined;
                    subscription_ends_at =
                        activeSub.currentPeriodEnd ?? undefined;
                    subscription_canceled_at =
                        activeSub.canceledAt ?? undefined;

                    // Warn if data inconsistency detected
                    if (activeSub.canceledAt && !activeSub.currentPeriodEnd) {
                        log.warn("Subscription canceled but missing end date", {
                            userId: user.id,
                        });
                    }

                    // Calculate next refill: 24 hours from subscription start
                    if (activeSub.currentPeriodStart) {
                        const startTime = new Date(
                            activeSub.currentPeriodStart,
                        ).getTime();
                        const daysPassed = Math.floor(
                            (Date.now() - startTime) / MS_PER_DAY,
                        );
                        next_refill_at_utc = new Date(
                            startTime + (daysPassed + 1) * MS_PER_DAY,
                        ).toISOString();
                    }

                    // Fetch product details for the active subscription
                    try {
                        const product = (await c.var.polar.client.products.get({
                            id: activeProductId,
                        })) as PolarProductMinimal;
                        tier_name = product.name;

                        // Extract daily pollen from meter_credit benefit
                        const meterBenefit =
                            product.benefits?.find(isMeterCreditBenefit);
                        const pollenValue = meterBenefit?.properties?.units;

                        if (pollenValue !== undefined) {
                            daily_pollen = pollenValue;
                        }
                    } catch (productError) {
                        log.warn("Failed to fetch product details: {error}", {
                            error: productError,
                        });
                    }
                }
            } catch (error) {
                // If Polar query fails, assume no active subscription
                log.error("Failed to check subscription status: {error}", {
                    error,
                });
                tier = "none";
                has_polar_error = true;
            }

            const viewModel: TierViewModel = {
                tier,
                tier_name,
                daily_pollen,
                next_refill_at_utc,
                has_polar_error,
                subscription_status,
                subscription_ends_at,
                subscription_canceled_at,
            };

            return c.json(viewModel);
        },
    );

export type TiersRoutes = typeof tiersRoutes;
